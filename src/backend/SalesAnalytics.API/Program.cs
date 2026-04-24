using System.Globalization;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Localization;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SalesAnalytics.API.Services;
using SalesAnalytics.Core.Interfaces;
using SalesAnalytics.Infrastructure.Data;
using SalesAnalytics.Infrastructure.Repositories;

var builder = WebApplication.CreateBuilder(args);

// ── 1. Database (EF Core + PostgreSQL) ───────────────────────────────────────
builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

// ── 2. Authentication – JWT HS256 ────────────────────────────────────────────
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

// ── 3. Localization (i18n) ────────────────────────────────────────────────────
builder.Services.AddLocalization(opt => opt.ResourcesPath = "Resources");
builder.Services.Configure<RequestLocalizationOptions>(opt =>
{
    var supported = new[] { new CultureInfo("vi"), new CultureInfo("en") };
    opt.DefaultRequestCulture = new RequestCulture("vi");
    opt.SupportedCultures      = supported;
    opt.SupportedUICultures    = supported;
    // Ưu tiên: Accept-Language header → query ?lang= → cookie
    opt.RequestCultureProviders =
    [
        new AcceptLanguageHeaderRequestCultureProvider(),
        new QueryStringRequestCultureProvider { QueryStringKey = "lang" },
        new CookieRequestCultureProvider(),
    ];
});

// ── 4. CORS ───────────────────────────────────────────────────────────────────
builder.Services.AddCors(opt =>
    opt.AddPolicy("AllowFrontend", policy =>
        policy
            .WithOrigins(
                "http://localhost:3000",    // React dev server (CRA)
                "http://localhost:5173"     // React dev server (Vite)
            )
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials()
    )
);

// ── 5. HTTP Client cho AI Service ────────────────────────────────────────────
builder.Services.AddHttpClient<AiProxyService>(client =>
{
    var aiBaseUrl = builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8001";
    client.BaseAddress = new Uri(aiBaseUrl);
    client.Timeout     = TimeSpan.FromSeconds(30);
});

// ── 6. Application Services ───────────────────────────────────────────────────
builder.Services.AddScoped<JwtService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<DashboardService>();
builder.Services.AddScoped<ReportService>();

// ── 7. Repository Pattern (DI) ────────────────────────────────────────────────
builder.Services.AddScoped<IProductRepository,   ProductRepository>();
builder.Services.AddScoped<IOrderRepository,     OrderRepository>();
builder.Services.AddScoped<ICustomerRepository,  CustomerRepository>();
builder.Services.AddScoped<IChannelRepository,   ChannelRepository>();
builder.Services.AddScoped<ISalesDataRepository, SalesDataRepository>();

// ── 7. Controllers + Swagger ─────────────────────────────────────────────────
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(opt =>
{
    opt.SwaggerDoc("v1", new() { Title = "Sales Analytics API", Version = "v1" });

    // Thêm JWT Bearer vào Swagger UI để test API trực tiếp
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

// ── Build & Configure Pipeline ────────────────────────────────────────────────
var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "Sales Analytics API v1"));
}

app.UseRequestLocalization();   // i18n phải đứng trước Authentication
app.UseCors("AllowFrontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
