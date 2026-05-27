using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Core.Enums;

namespace SalesAnalytics.Infrastructure.Data;

/// <summary>EF Core DbContext – schema public (OLTP)</summary>
public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    // Helper để parse JSON — tránh optional-argument trong expression tree
    private static JsonDocument _ParseJson(string v) => JsonDocument.Parse(v);

    // ── DbSets ────────────────────────────────────────────────────────────────
    public DbSet<User>        Users        => Set<User>();
    public DbSet<Category>    Categories   => Set<Category>();
    public DbSet<Channel>     Channels     => Set<Channel>();
    public DbSet<Customer>    Customers    => Set<Customer>();
    public DbSet<Product>     Products     => Set<Product>();
    public DbSet<Order>       Orders       => Set<Order>();
    public DbSet<OrderDetail> OrderDetails => Set<OrderDetail>();
    public DbSet<SalesData>   SalesData    => Set<SalesData>();
    public DbSet<EtlLog>                 EtlLogs                 => Set<EtlLog>();
    public DbSet<ScraperKeyword>         ScraperKeywords         => Set<ScraperKeyword>();
    public DbSet<AuditLog>               AuditLogs               => Set<AuditLog>();
    public DbSet<LoginHistory>           LoginHistories          => Set<LoginHistory>();
    public DbSet<NotificationPreference> NotificationPreferences => Set<NotificationPreference>();
    public DbSet<Notification>           Notifications           => Set<Notification>();
    public DbSet<PushToken>              PushTokens              => Set<PushToken>();
    public DbSet<EmailVerification>      EmailVerifications      => Set<EmailVerification>();

    // Multi-tenant (thêm [2025-05-07])
    public DbSet<Company>      Companies     => Set<Company>();
    public DbSet<Subscription> Subscriptions => Set<Subscription>();
    public DbSet<Invoice>      Invoices      => Set<Invoice>();

    // Super Admin: tài khoản thanh toán hệ thống
    public DbSet<SystemPaymentAccount> SystemPaymentAccounts => Set<SystemPaymentAccount>();

    // Open Platform extensions (thêm 2026-05-21)
    public DbSet<ProductVariation> ProductVariations => Set<ProductVariation>();

    // Payment module (thêm 2026-05-27)
    public DbSet<PaymentTransaction>  PaymentTransactions  => Set<PaymentTransaction>();
    public DbSet<PaymentWebhookLog>   PaymentWebhookLogs   => Set<PaymentWebhookLog>();
    public DbSet<PaymentMethodConfig> PaymentMethodConfigs => Set<PaymentMethodConfig>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // ── User ─────────────────────────────────────────────────────────────
        modelBuilder.Entity<User>(e =>
        {
            e.ToTable("users", "public");
            e.HasKey(u => u.Id);
            e.Property(u => u.Id).HasColumnName("user_id");
            e.Property(u => u.Email).HasColumnName("email").HasMaxLength(255);
            e.Property(u => u.FullName).HasColumnName("full_name").HasMaxLength(255);
            e.Property(u => u.IsActive).HasColumnName("is_active");
            e.Property(u => u.PreferredLanguage).HasColumnName("preferred_language").HasMaxLength(10).HasDefaultValue("vi");
            e.Property(u => u.CreatedAt).HasColumnName("created_at");
            e.Property(u => u.Username).HasColumnName("username").HasMaxLength(50).IsRequired();
            e.Property(u => u.PasswordHash).HasColumnName("password_hash");
            e.Property(u => u.Role).HasColumnName("role").HasConversion<string>().HasMaxLength(20);
            e.Property(u => u.LastLoginAt).HasColumnName("last_login_at");
            e.Property(u => u.RefreshToken).HasColumnName("refresh_token");
            e.Property(u => u.RefreshTokenExpiresAt).HasColumnName("refresh_token_expires_at");
            // Extended profile columns
            e.Property(u => u.AvatarUrl).HasColumnName("avatar_url").HasMaxLength(500);
            e.Property(u => u.Phone).HasColumnName("phone").HasMaxLength(20);
            e.Property(u => u.Birthdate).HasColumnName("birthdate");
            e.Property(u => u.Timezone).HasColumnName("timezone").HasMaxLength(50).HasDefaultValue("Asia/Ho_Chi_Minh");
            e.Property(u => u.LangPref).HasColumnName("lang_pref").HasMaxLength(10).HasDefaultValue("vi");
            // Reset password
            e.Property(u => u.ResetToken).HasColumnName("reset_token").HasMaxLength(200);
            e.Property(u => u.ResetTokenExpiry).HasColumnName("reset_token_expiry");
            // Multi-tenant columns
            e.Property(u => u.CompanyId).HasColumnName("company_id");
            e.Property(u => u.IsSuperAdmin).HasColumnName("is_super_admin").HasDefaultValue(false);
            e.HasOne(u => u.Company)
             .WithMany(c => c.Users)
             .HasForeignKey(u => u.CompanyId)
             .OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(u => u.Username).IsUnique();
            e.HasIndex(u => u.Email).IsUnique();
            e.HasIndex(u => u.CompanyId);
        });

        // ── Company ───────────────────────────────────────────────────────────
        modelBuilder.Entity<Company>(e =>
        {
            e.ToTable("companies", "public");
            e.HasKey(c => c.Id);
            e.Property(c => c.Id).HasColumnName("id").HasDefaultValueSql("gen_random_uuid()");
            e.Property(c => c.Name).HasColumnName("name").HasMaxLength(200).IsRequired();
            e.Property(c => c.Slug).HasColumnName("slug").HasMaxLength(100).IsRequired();
            e.Property(c => c.Email).HasColumnName("email").HasMaxLength(150).IsRequired();
            e.Property(c => c.Phone).HasColumnName("phone").HasMaxLength(20);
            e.Property(c => c.LogoUrl).HasColumnName("logo_url").HasMaxLength(500);
            e.Property(c => c.Industry).HasColumnName("industry").HasMaxLength(100);
            e.Property(c => c.BusinessScale).HasColumnName("business_scale").HasMaxLength(50);
            e.Property(c => c.ShopName).HasColumnName("shop_name").HasMaxLength(200);
            e.Property(c => c.Address).HasColumnName("address");
            e.Property(c => c.Timezone).HasColumnName("timezone").HasMaxLength(50).HasDefaultValue("Asia/Ho_Chi_Minh");
            e.Property(c => c.LangPref).HasColumnName("lang_pref").HasMaxLength(10).HasDefaultValue("vi");
            e.Property(c => c.OnboardingCompleted).HasColumnName("onboarding_completed").HasDefaultValue(false);
            e.Property(c => c.OnboardingStep).HasColumnName("onboarding_step").HasDefaultValue(0);
            e.Property(c => c.IsActive).HasColumnName("is_active").HasDefaultValue(true);
            e.Property(c => c.LockReason).HasColumnName("lock_reason");
            e.Property(c => c.LockedAt).HasColumnName("locked_at");
            e.Property(c => c.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("NOW()");
            e.Property(c => c.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("NOW()");
            e.HasIndex(c => c.Slug).IsUnique();
            e.HasIndex(c => c.Email).IsUnique();
        });

        // ── SystemPaymentAccount ─────────────────────────────────────────────
        modelBuilder.Entity<SystemPaymentAccount>(e =>
        {
            e.ToTable("system_payment_accounts", "public");
            e.HasKey(a => a.Id);
            e.Property(a => a.Id).HasColumnName("id").HasDefaultValueSql("gen_random_uuid()");
            e.Property(a => a.Method).HasColumnName("method").HasMaxLength(50).IsRequired();
            e.Property(a => a.DisplayName).HasColumnName("display_name").HasMaxLength(200).IsRequired();
            e.Property(a => a.IsActive).HasColumnName("is_active").HasDefaultValue(true);
            e.Property(a => a.IsDefault).HasColumnName("is_default").HasDefaultValue(false);
            // ValueConverter: JsonDocument ↔ string — cần để InMemory provider (tests) hoạt động.
            // Dùng static helper _ParseJson thay vì JsonDocument.Parse(v) trực tiếp
            // vì expression tree không cho phép gọi method có optional arguments.
            var jsonDocConverter = new ValueConverter<JsonDocument, string>(
                v => v.RootElement.GetRawText(),
                v => _ParseJson(v));
            e.Property(a => a.Config).HasColumnName("config").HasColumnType("jsonb")
             .HasConversion(jsonDocConverter);
            e.Property(a => a.ConfigMasked).HasColumnName("config_masked").HasColumnType("jsonb")
             .HasConversion(jsonDocConverter);
            e.Property(a => a.Note).HasColumnName("note");
            e.Property(a => a.SortOrder).HasColumnName("sort_order").HasDefaultValue(0);
            e.Property(a => a.CreatedBy).HasColumnName("created_by");
            e.Property(a => a.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("NOW()");
            e.Property(a => a.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("NOW()");
            e.HasIndex(a => a.Method);
        });

        // ── Subscription ──────────────────────────────────────────────────────
        modelBuilder.Entity<Subscription>(e =>
        {
            e.ToTable("subscriptions", "public");
            e.HasKey(s => s.Id);
            e.Property(s => s.Id).HasColumnName("id").HasDefaultValueSql("gen_random_uuid()");
            e.Property(s => s.CompanyId).HasColumnName("company_id").IsRequired();
            e.Property(s => s.Plan).HasColumnName("plan").HasMaxLength(20).HasDefaultValue("free");
            e.Property(s => s.Status).HasColumnName("status").HasMaxLength(20).HasDefaultValue("active");
            e.Property(s => s.StartedAt).HasColumnName("started_at").HasDefaultValueSql("NOW()");
            e.Property(s => s.ExpiresAt).HasColumnName("expires_at");
            e.Property(s => s.TrialEndsAt).HasColumnName("trial_ends_at");
            e.Property(s => s.GraceEndsAt).HasColumnName("grace_ends_at");
            e.Property(s => s.AutoRenew).HasColumnName("auto_renew").HasDefaultValue(true);
            e.Property(s => s.MaxChannels).HasColumnName("max_channels").HasDefaultValue(2);
            e.Property(s => s.MaxUsers).HasColumnName("max_users").HasDefaultValue(3);
            e.Property(s => s.AiEnabled).HasColumnName("ai_enabled").HasDefaultValue(false);
            e.Property(s => s.AdvancedReports).HasColumnName("advanced_reports").HasDefaultValue(false);
            e.Property(s => s.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("NOW()");
            e.Property(s => s.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("NOW()");
            e.HasOne(s => s.Company)
             .WithMany(c => c.Subscriptions)
             .HasForeignKey(s => s.CompanyId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(s => s.CompanyId);
        });

        // ── Invoice ───────────────────────────────────────────────────────────
        modelBuilder.Entity<Invoice>(e =>
        {
            e.ToTable("invoices", "public");
            e.HasKey(i => i.Id);
            e.Property(i => i.Id).HasColumnName("id").HasDefaultValueSql("gen_random_uuid()");
            e.Property(i => i.CompanyId).HasColumnName("company_id").IsRequired();
            e.Property(i => i.SubscriptionId).HasColumnName("subscription_id");
            e.Property(i => i.InvoiceCode).HasColumnName("invoice_code").HasMaxLength(50).IsRequired();
            e.Property(i => i.Plan).HasColumnName("plan").HasMaxLength(20).IsRequired();
            e.Property(i => i.Amount).HasColumnName("amount").HasColumnType("numeric(15,2)").IsRequired();
            e.Property(i => i.Currency).HasColumnName("currency").HasMaxLength(10).HasDefaultValue("VND");
            e.Property(i => i.PaymentMethod).HasColumnName("payment_method").HasMaxLength(50);
            e.Property(i => i.PaymentStatus).HasColumnName("payment_status").HasMaxLength(20).HasDefaultValue("pending");
            e.Property(i => i.PaymentGatewayRef).HasColumnName("payment_gateway_ref").HasMaxLength(200);
            e.Property(i => i.BillingPeriodStart).HasColumnName("billing_period_start");
            e.Property(i => i.BillingPeriodEnd).HasColumnName("billing_period_end");
            e.Property(i => i.PaidAt).HasColumnName("paid_at");
            e.Property(i => i.PdfUrl).HasColumnName("pdf_url").HasMaxLength(500);
            e.Property(i => i.Metadata).HasColumnName("metadata").HasColumnType("jsonb");
            e.Property(i => i.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("NOW()");
            e.HasOne(i => i.Company)
             .WithMany()
             .HasForeignKey(i => i.CompanyId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(i => i.Subscription)
             .WithMany()
             .HasForeignKey(i => i.SubscriptionId)
             .OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(i => i.InvoiceCode).IsUnique();
            e.HasIndex(i => i.CompanyId);
        });

        // ── Category ─────────────────────────────────────────────────────────
        modelBuilder.Entity<Category>(e =>
        {
            e.HasOne(c => c.Parent)
             .WithMany(c => c.Children)
             .HasForeignKey(c => c.ParentId)
             .OnDelete(DeleteBehavior.SetNull);

            e.Property(c => c.Level).HasDefaultValue((short)1);
            e.Property(c => c.IsActive).HasDefaultValue(true);
            e.Property(c => c.SortOrder).HasDefaultValue(0);
            e.Property(c => c.CreatedAt).HasDefaultValueSql("NOW()");
            e.Property(c => c.Slug).HasMaxLength(200);
            e.HasIndex(c => c.Slug).IsUnique().HasFilter("slug IS NOT NULL");
            e.HasIndex(c => c.CompanyId);
        });

        // ── EmailVerification ────────────────────────────────────────────────
        modelBuilder.Entity<EmailVerification>(e =>
        {
            e.Property(v => v.Purpose).HasMaxLength(50).HasDefaultValue("register");
            e.Property(v => v.IsUsed).HasDefaultValue(false);
            e.Property(v => v.Attempts).HasDefaultValue(0);
            e.Property(v => v.CreatedAt).HasDefaultValueSql("NOW()");
            e.HasIndex(v => new { v.Email, v.Purpose });
        });

        // ── Notification ─────────────────────────────────────────────────────
        modelBuilder.Entity<Notification>(e =>
        {
            e.Property(n => n.Type).HasMaxLength(50).HasDefaultValue("info");
            e.Property(n => n.Category).HasMaxLength(50);
            e.Property(n => n.IsRead).HasDefaultValue(false);
            e.Property(n => n.SentEmail).HasDefaultValue(false);
            e.Property(n => n.SentPush).HasDefaultValue(false);
            e.Property(n => n.Data).HasColumnType("jsonb");
            e.Property(n => n.Channels).HasColumnType("text[]");
            e.Property(n => n.CreatedAt).HasDefaultValueSql("NOW()");
            e.HasOne(n => n.User)
             .WithMany()
             .HasForeignKey(n => n.UserId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(n => new { n.UserId, n.IsRead, n.CreatedAt });
            e.HasIndex(n => new { n.CompanyId, n.CreatedAt });
        });

        // ── PushToken ────────────────────────────────────────────────────────
        modelBuilder.Entity<PushToken>(e =>
        {
            e.Property(p => p.IsActive).HasDefaultValue(true);
            e.Property(p => p.LastUsedAt).HasDefaultValueSql("NOW()");
            e.Property(p => p.CreatedAt).HasDefaultValueSql("NOW()");
            e.HasOne(p => p.User)
             .WithMany()
             .HasForeignKey(p => p.UserId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(p => new { p.UserId, p.ExpoToken }).IsUnique();
            e.HasIndex(p => new { p.UserId, p.IsActive });
        });

        // ── Channel ──────────────────────────────────────────────────────────
        modelBuilder.Entity<Channel>(e =>
        {
            e.Property(c => c.IsActive).HasDefaultValue(true);
            e.Property(c => c.SyncStatus).HasDefaultValue("IDLE").HasMaxLength(50);
            e.Property(c => c.CreatedAt).HasDefaultValueSql("NOW()");
            e.Property(c => c.UpdatedAt).HasDefaultValueSql("NOW()");
        });

        // ── Customer ─────────────────────────────────────────────────────────
        modelBuilder.Entity<Customer>(e =>
        {
            e.HasIndex(c => c.CustomerCode).IsUnique().HasFilter("customer_code IS NOT NULL");
            e.Property(c => c.TotalOrders).HasDefaultValue(0);
            e.Property(c => c.TotalSpent).HasDefaultValue(0m);
            e.Property(c => c.IsActive).HasDefaultValue(true);
            e.Property(c => c.CreatedAt).HasDefaultValueSql("NOW()");
            e.Property(c => c.UpdatedAt).HasDefaultValueSql("NOW()");
        });

        // ── ProductVariation ─────────────────────────────────────────────────
        modelBuilder.Entity<ProductVariation>(e =>
        {
            e.ToTable("product_variations", "public");
            e.HasKey(v => v.Id);
            e.Property(v => v.Id).HasColumnName("id");
            e.Property(v => v.CompanyId).HasColumnName("company_id");
            e.Property(v => v.ProductId).HasColumnName("product_id");
            e.Property(v => v.ShopeeModelId).HasColumnName("shopee_model_id");
            e.Property(v => v.TiktokSkuId).HasColumnName("tiktok_sku_id").HasMaxLength(50);
            e.Property(v => v.LazadaSkuId).HasColumnName("lazada_sku_id");
            e.Property(v => v.Sku).HasColumnName("sku").HasMaxLength(100).IsRequired();
            e.Property(v => v.VariationName).HasColumnName("variation_name").HasMaxLength(255);
            e.Property(v => v.AttributeColor).HasColumnName("attribute_color").HasMaxLength(100);
            e.Property(v => v.AttributeSize).HasColumnName("attribute_size").HasMaxLength(50);
            e.Property(v => v.OriginalPrice).HasColumnName("original_price").HasColumnType("decimal(15,2)");
            e.Property(v => v.SalePrice).HasColumnName("sale_price").HasColumnType("decimal(15,2)");
            e.Property(v => v.Currency).HasColumnName("currency").HasMaxLength(10).HasDefaultValue("VND");
            e.Property(v => v.StockQuantity).HasColumnName("stock_quantity").HasDefaultValue(0);
            e.Property(v => v.WarehouseId).HasColumnName("warehouse_id").HasMaxLength(100);
            e.Property(v => v.ImageUrl).HasColumnName("image_url");
            e.Property(v => v.IsActive).HasColumnName("is_active").HasDefaultValue(true);
            e.Property(v => v.PlatformStatus).HasColumnName("platform_status").HasMaxLength(50);
            e.Property(v => v.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("NOW()");
            e.Property(v => v.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("NOW()");
            e.HasOne(v => v.Product)
             .WithMany(p => p.Variations)
             .HasForeignKey(v => v.ProductId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(v => new { v.ProductId, v.Sku }).IsUnique();
            e.HasIndex(v => new { v.CompanyId, v.Sku });
        });

        // ── Product ──────────────────────────────────────────────────────────
        modelBuilder.Entity<Product>(e =>
        {
            e.HasIndex(p => p.Sku).IsUnique();
            e.HasOne(p => p.Category)
             .WithMany(c => c.Products)
             .HasForeignKey(p => p.CategoryId)
             .OnDelete(DeleteBehavior.Restrict);

            e.Property(p => p.StockQuantity).HasDefaultValue(0);
            e.Property(p => p.IsActive).HasDefaultValue(true);
            e.Property(p => p.CreatedAt).HasDefaultValueSql("NOW()");
            e.Property(p => p.UpdatedAt).HasDefaultValueSql("NOW()");
        });

        // ── Order ────────────────────────────────────────────────────────────
        modelBuilder.Entity<Order>(e =>
        {
            e.HasIndex(o => o.OrderCode).IsUnique();
            e.HasIndex(o => o.ExternalOrderId).IsUnique().HasFilter("external_order_id IS NOT NULL");

            e.HasOne(o => o.Customer)
             .WithMany(c => c.Orders)
             .HasForeignKey(o => o.CustomerId)
             .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(o => o.Channel)
             .WithMany(ch => ch.Orders)
             .HasForeignKey(o => o.ChannelId)
             .OnDelete(DeleteBehavior.Restrict);

            // net_amount là cột GENERATED – EF không ghi, chỉ đọc
            e.Property<decimal>("NetAmount")
             .HasColumnName("net_amount")
             .ValueGeneratedOnAddOrUpdate();

            e.Property(o => o.Status).HasDefaultValue("PENDING").HasMaxLength(50);
            e.Property(o => o.DiscountAmount).HasDefaultValue(0m);
            e.Property(o => o.ShippingFee).HasDefaultValue(0m);
            e.Property(o => o.PaymentStatus).HasDefaultValue("UNPAID").HasMaxLength(50);
            e.Property(o => o.ShippingStatus).HasDefaultValue("NOT_SHIPPED").HasMaxLength(50);
            e.Property(o => o.CreatedAt).HasDefaultValueSql("NOW()");
            e.Property(o => o.UpdatedAt).HasDefaultValueSql("NOW()");
        });

        // ── OrderDetail ──────────────────────────────────────────────────────
        modelBuilder.Entity<OrderDetail>(e =>
        {
            e.HasOne(d => d.Order)
             .WithMany(o => o.OrderDetails)
             .HasForeignKey(d => d.OrderId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(d => d.Product)
             .WithMany(p => p.OrderDetails)
             .HasForeignKey(d => d.ProductId)
             .OnDelete(DeleteBehavior.Restrict);

            e.Property(d => d.Discount).HasDefaultValue(0m);
        });

        // ── SalesData ────────────────────────────────────────────────────────
        modelBuilder.Entity<SalesData>(e =>
        {
            e.HasOne(s => s.Order)
             .WithMany()
             .HasForeignKey(s => s.OrderId)
             .OnDelete(DeleteBehavior.SetNull);

            e.HasOne(s => s.Channel)
             .WithMany()
             .HasForeignKey(s => s.ChannelId)
             .OnDelete(DeleteBehavior.Restrict);

            e.Property(s => s.Cost).HasDefaultValue(0m);
            e.Property(s => s.CreatedAt).HasDefaultValueSql("NOW()");

            // Index cho Prophet time-series query
            e.HasIndex(s => s.SaleDate);
            e.HasIndex(s => new { s.ChannelId, s.SaleDate });
        });

        // ── EtlLog ───────────────────────────────────────────────────────────
        modelBuilder.Entity<EtlLog>(e =>
        {
            e.Property(l => l.Phase).HasDefaultValue("GENERAL").HasMaxLength(100);
            e.Property(l => l.Level).HasDefaultValue("INFO").HasMaxLength(20);
            e.Property(l => l.CreatedAt).HasDefaultValueSql("NOW()");
        });

        // ── AuditLog ─────────────────────────────────────────────────────────
        modelBuilder.Entity<AuditLog>(e =>
        {
            e.Property(a => a.Status).HasDefaultValue("SUCCESS").HasMaxLength(20);
            e.Property(a => a.CreatedAt).HasDefaultValueSql("NOW()");
            e.HasOne(a => a.User)
             .WithMany()
             .HasForeignKey(a => a.UserId)
             .OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(a => new { a.UserId, a.CreatedAt });
            e.HasIndex(a => new { a.Action, a.CreatedAt });
            e.HasIndex(a => a.CreatedAt);
        });

        // ── ScraperKeyword ───────────────────────────────────────────────────
        modelBuilder.Entity<ScraperKeyword>(e =>
        {
            // Unique per (keyword, source, company) để cho phép nhiều công ty dùng cùng keyword
            e.HasIndex(k => new { k.Keyword, k.SourceType, k.CompanyId }).IsUnique();
            e.HasIndex(k => new { k.IsActive, k.SourceType, k.CompanyId });
            e.Property(k => k.SourceType).HasDefaultValue("google");
            e.Property(k => k.IsActive).HasDefaultValue(true);
            e.Property(k => k.UseCount).HasDefaultValue(0);
            e.Property(k => k.CreatedAt).HasDefaultValueSql("NOW()");
            e.HasOne(k => k.Creator)
             .WithMany()
             .HasForeignKey(k => k.CreatedBy)
             .OnDelete(DeleteBehavior.SetNull);
        });

        // ── LoginHistory ─────────────────────────────────────────────────────
        modelBuilder.Entity<LoginHistory>(e =>
        {
            e.Property(l => l.Status).HasDefaultValue("SUCCESS").HasMaxLength(20);
            e.Property(l => l.LoggedAt).HasDefaultValueSql("NOW()");
            e.HasOne(l => l.User)
             .WithMany()
             .HasForeignKey(l => l.UserId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(l => l.UserId);
            e.HasIndex(l => l.LoggedAt);
        });

        // ── PaymentTransaction ───────────────────────────────────────────────
        modelBuilder.Entity<PaymentTransaction>(e =>
        {
            e.ToTable("payment_transactions", "public");
            e.HasKey(p => p.Id);
            e.Property(p => p.Id).HasColumnName("id").HasDefaultValueSql("gen_random_uuid()");
            e.Property(p => p.OrderId).HasColumnName("order_id");
            e.Property(p => p.InvoiceId).HasColumnName("invoice_id");
            e.Property(p => p.TenantId).HasColumnName("tenant_id").IsRequired();
            e.Property(p => p.PaymentCode).HasColumnName("payment_code").HasMaxLength(100).IsRequired();
            e.Property(p => p.PaymentMethod).HasColumnName("payment_method")
             .HasConversion<string>().HasMaxLength(30).IsRequired();
            e.Property(p => p.Amount).HasColumnName("amount").HasColumnType("numeric(15,2)").IsRequired();
            e.Property(p => p.Currency).HasColumnName("currency").HasMaxLength(10).HasDefaultValue("VND");
            e.Property(p => p.Status).HasColumnName("status")
             .HasConversion<string>().HasMaxLength(20).HasDefaultValue(PaymentStatus.Pending);
            e.Property(p => p.TransactionCode).HasColumnName("transaction_code").HasMaxLength(200);
            e.Property(p => p.GatewayResponse).HasColumnName("gateway_response").HasColumnType("jsonb");
            e.Property(p => p.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("NOW()");
            e.Property(p => p.PaidAt).HasColumnName("paid_at");
            e.Property(p => p.ExpiredAt).HasColumnName("expired_at");
            e.Property(p => p.CreatedBy).HasColumnName("created_by");
            e.HasOne(p => p.Order)
             .WithMany()
             .HasForeignKey(p => p.OrderId)
             .OnDelete(DeleteBehavior.SetNull);
            e.HasOne(p => p.Invoice)
             .WithMany()
             .HasForeignKey(p => p.InvoiceId)
             .OnDelete(DeleteBehavior.SetNull);
            e.HasOne(p => p.Creator)
             .WithMany()
             .HasForeignKey(p => p.CreatedBy)
             .OnDelete(DeleteBehavior.SetNull);
            e.HasIndex(p => p.PaymentCode);
            e.HasIndex(p => p.TenantId);
            e.HasIndex(p => p.OrderId);
            e.HasIndex(p => new { p.Status, p.CreatedAt });
        });

        // ── PaymentWebhookLog ────────────────────────────────────────────────
        modelBuilder.Entity<PaymentWebhookLog>(e =>
        {
            e.ToTable("payment_webhook_logs", "public");
            e.HasKey(w => w.Id);
            e.Property(w => w.Id).HasColumnName("id").HasDefaultValueSql("gen_random_uuid()");
            e.Property(w => w.Provider).HasColumnName("provider").HasMaxLength(50).IsRequired();
            e.Property(w => w.Payload).HasColumnName("payload").HasColumnType("jsonb").IsRequired();
            e.Property(w => w.Signature).HasColumnName("signature").HasMaxLength(500);
            e.Property(w => w.ProcessedStatus).HasColumnName("processed_status").HasMaxLength(20).HasDefaultValue("PENDING");
            e.Property(w => w.Notes).HasColumnName("notes");
            e.Property(w => w.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("NOW()");
            e.HasIndex(w => new { w.Provider, w.CreatedAt });
        });

        // ── PaymentMethodConfig ──────────────────────────────────────────────
        modelBuilder.Entity<PaymentMethodConfig>(e =>
        {
            e.ToTable("payment_method_configs", "public");
            e.HasKey(c => c.Id);
            e.Property(c => c.Id).HasColumnName("id").HasDefaultValueSql("gen_random_uuid()");
            e.Property(c => c.PaymentMethod).HasColumnName("payment_method").HasMaxLength(50).IsRequired();
            e.Property(c => c.Enabled).HasColumnName("enabled").HasDefaultValue(true);
            e.Property(c => c.ConfigJson).HasColumnName("config_json").HasColumnType("jsonb");
            e.Property(c => c.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("NOW()");
            e.Property(c => c.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("NOW()");
            e.HasIndex(c => c.PaymentMethod).IsUnique();
        });

        // ── NotificationPreference ───────────────────────────────────────────
        modelBuilder.Entity<NotificationPreference>(e =>
        {
            e.Property(n => n.UpdatedAt).HasDefaultValueSql("NOW()");
            e.HasOne(n => n.User)
             .WithMany()
             .HasForeignKey(n => n.UserId)
             .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(n => n.UserId).IsUnique();
        });
    }
}
