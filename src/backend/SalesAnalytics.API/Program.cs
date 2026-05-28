using System.Globalization;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Localization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Serilog;
using Serilog.Events;
using SalesAnalytics.API.Attributes;
using SalesAnalytics.API.Filters;
using SalesAnalytics.API.Services;
using SalesAnalytics.Core.Interfaces;
using SalesAnalytics.Infrastructure.Data;
using SalesAnalytics.Infrastructure.Repositories;

// ── Serilog: cấu hình sớm để bắt lỗi khởi động ─────────────────────────────
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .MinimumLevel.Override("Microsoft.EntityFrameworkCore.Database.Command", LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.AspNetCore.Routing", LogEventLevel.Warning)
    .Enrich.FromLogContext()
    .WriteTo.Console(outputTemplate:
        "[{Timestamp:HH:mm:ss} {Level:u3}] {SourceContext} {Message:lj}{NewLine}{Exception}")
    .WriteTo.File(
        path:              "logs/api-.log",
        rollingInterval:   RollingInterval.Day,
        retainedFileCountLimit: 14,
        outputTemplate:
            "{Timestamp:yyyy-MM-dd HH:mm:ss.fff} [{Level:u3}] {SourceContext} {Message:lj}{NewLine}{Exception}"
    )
    .CreateLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    // Dùng Serilog thay cho built-in logger
    builder.Host.UseSerilog();

    // ── 1. Database (EF Core + PostgreSQL) ───────────────────────────────────
    builder.Services.AddDbContext<AppDbContext>(opt =>
        opt.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

    // ── 2. Authentication – JWT HS256 ────────────────────────────────────────
    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(opt =>
        {
            opt.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer           = true,
                ValidIssuer              = builder.Configuration["Jwt:Issuer"],
                ValidateAudience         = true,
                ValidAudience            = builder.Configuration["Jwt:Audience"],
                ValidateLifetime         = true,
                IssuerSigningKey         = new SymmetricSecurityKey(
                    Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Secret"]!)
                ),
                ValidateIssuerSigningKey = true,
                ClockSkew                = TimeSpan.Zero,
            };
        });

    builder.Services.AddAuthorization();

    // ── 3. Localization (i18n) ────────────────────────────────────────────────
    builder.Services.AddLocalization(opt => opt.ResourcesPath = "Resources");
    builder.Services.Configure<RequestLocalizationOptions>(opt =>
    {
        var supported = new[] { new CultureInfo("vi"), new CultureInfo("en") };
        opt.DefaultRequestCulture = new RequestCulture("vi");
        opt.SupportedCultures      = supported;
        opt.SupportedUICultures    = supported;
        opt.RequestCultureProviders =
        [
            new AcceptLanguageHeaderRequestCultureProvider(),
            new QueryStringRequestCultureProvider { QueryStringKey = "lang" },
            new CookieRequestCultureProvider(),
        ];
    });

    // ── 4. CORS ───────────────────────────────────────────────────────────────
    builder.Services.AddCors(opt =>
        opt.AddPolicy("AllowFrontend", policy =>
            policy
                .WithOrigins(
                    "http://localhost:3000",
                    "http://localhost:5173",
                    "http://localhost:5174"
                )
                .AllowAnyHeader()
                .AllowAnyMethod()
                .AllowCredentials()
        )
    );

    // ── 5. Rate Limiting (fixed window) ──────────────────────────────────────
    // Auth endpoint giới hạn chặt hơn (chống brute-force)
    builder.Services.AddRateLimiter(opt =>
    {
        opt.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

        // Policy mặc định: 100 req / 10 giây / IP
        opt.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
            RateLimitPartition.GetFixedWindowLimiter(
                partitionKey: ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                factory:      _ => new FixedWindowRateLimiterOptions
                {
                    Window           = TimeSpan.FromSeconds(10),
                    PermitLimit      = 100,
                    QueueLimit       = 0,
                    QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                }
            )
        );

        // Policy chặt cho auth (login/register): 5 req / 1 phút / IP
        opt.AddFixedWindowLimiter("auth", o =>
        {
            o.Window        = TimeSpan.FromMinutes(1);
            o.PermitLimit   = 5;
            o.QueueLimit    = 0;
        });
    });

    // ── 6. HTTP Client cho AI Service + Email Service + Expo Push ────────────
    // IHttpClientFactory chung – dùng cho GeminiService và các call HTTP tùy ý
    builder.Services.AddHttpClient();

    builder.Services.AddHttpClient<AiProxyService>(client =>
    {
        var aiBaseUrl = builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8001";
        client.BaseAddress = new Uri(aiBaseUrl);
        client.Timeout     = TimeSpan.FromSeconds(30);
    });

    // Email – Resend Transactional Email
    builder.Services.AddHttpClient<IEmailService, ResendEmailService>();

    // Expo Push Notifications
    builder.Services.AddHttpClient<IExpoPushService, ExpoPushService>();

    // Named client cho IntegrationsController gọi AI Service scrape endpoint
    // Timeout 180s vì scraper có thể chờ 60s retry khi bị 429 + thời gian crawl
    builder.Services.AddHttpClient("AiService", client =>
    {
        var aiBaseUrl = builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8001";
        client.BaseAddress = new Uri(aiBaseUrl);
        client.Timeout     = TimeSpan.FromSeconds(180);
    });

    // ── 7. Application Services ───────────────────────────────────────────────
    builder.Services.AddScoped<JwtService>();
    builder.Services.AddScoped<AuthService>();
    builder.Services.AddScoped<DashboardService>();
    builder.Services.AddScoped<ReportService>();
    builder.Services.AddScoped<IAuditLogService, AuditLogService>();
    builder.Services.AddScoped<CryptoService>();

    // Gemini AI Chatbot service
    builder.Services.AddScoped<GeminiService>();

    // OTP + Notification services (thêm [2026-05-08])
    builder.Services.AddScoped<IOtpService, OtpService>();
    builder.Services.AddScoped<INotificationService, NotificationService>();

    // Multi-tenant services (thêm [2025-05-07])
    builder.Services.AddHttpContextAccessor();
    builder.Services.AddScoped<ITenantContext, TenantContext>();
    builder.Services.AddMemoryCache();  // Dùng cho SubscriptionAuthorizationFilter cache

    // Payment services (thêm 2026-05-27)
    builder.Services.AddScoped<VietQRService>();
    builder.Services.AddScoped<PaymentService>();
    builder.Services.AddScoped<SubscriptionPaymentService>();

    // Background jobs
    builder.Services.AddHostedService<SubscriptionExpiryJob>();
    builder.Services.AddSingleton<SmartAlertJob>();
    builder.Services.AddHostedService(sp => sp.GetRequiredService<SmartAlertJob>());
    builder.Services.AddHostedService<EtlSchedulerJob>();

    // ── 8. Repository Pattern (DI) ────────────────────────────────────────────
    builder.Services.AddScoped<IProductRepository,   ProductRepository>();
    builder.Services.AddScoped<IOrderRepository,     OrderRepository>();
    builder.Services.AddScoped<ICustomerRepository,  CustomerRepository>();
    builder.Services.AddScoped<IChannelRepository,   ChannelRepository>();
    builder.Services.AddScoped<ISalesDataRepository, SalesDataRepository>();

    // ── 9. Controllers + Swagger ─────────────────────────────────────────────
    // Đăng ký global filters multi-tenant
    builder.Services.AddScoped<TenantAuthorizationFilter>();
    builder.Services.AddScoped<SubscriptionAuthorizationFilter>();
    builder.Services.AddControllers(opt =>
    {
        // TenantAuthorizationFilter: yêu cầu company_id cho mọi API (trừ /auth/*, /admin/*)
        opt.Filters.Add<TenantAuthorizationFilter>();
        // SubscriptionAuthorizationFilter: kiểm tra gói [RequirePlan]
        opt.Filters.Add<SubscriptionAuthorizationFilter>();
    })
    .AddJsonOptions(opt =>
    {
        // Đảm bảo tất cả API response đều trả camelCase cho React frontend
        opt.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        opt.JsonSerializerOptions.DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull;
        // Cho phép deserialize enum từ tên chuỗi (VD: "VIETQR" → PaymentMethod.VIETQR)
        opt.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
    });
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(opt =>
    {
        opt.SwaggerDoc("v1", new() { Title = "Sales Analytics API", Version = "v1" });
        opt.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
        {
            Name         = "Authorization",
            Type         = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
            Scheme       = "bearer",
            BearerFormat = "JWT",
            In           = Microsoft.OpenApi.Models.ParameterLocation.Header,
            Description  = "Nhập JWT token (không cần gõ 'Bearer ')",
        });
        opt.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
        {
            [new() { Reference = new() { Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme, Id = "Bearer" } }] = []
        });
    });

    // ── Build & Configure Pipeline ────────────────────────────────────────────
    var app = builder.Build();

    if (app.Environment.IsDevelopment())
    {
        app.UseSwagger();
        app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "Sales Analytics API v1"));
    }
    else
    {
        // Chỉ redirect HTTPS trên production để tránh break Vite proxy trong dev
        app.UseHttpsRedirection();
    }
    app.UseStaticFiles();             // Serve wwwroot/ (avatars, product images...)
    app.UseRateLimiter();             // Rate limiting trước khi xử lý request
    app.UseSerilogRequestLogging(opt => // Ghi log mỗi request với thông tin cơ bản
    {
        opt.MessageTemplate = "HTTP {RequestMethod} {RequestPath} → {StatusCode} ({Elapsed:0.0}ms)";
    });
    app.UseRequestLocalization();
    app.UseCors("AllowFrontend");
    app.UseAuthentication();
    app.UseAuthorization();
    app.MapControllers();

    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Application startup failed");
}
finally
{
    Log.CloseAndFlush();
}
