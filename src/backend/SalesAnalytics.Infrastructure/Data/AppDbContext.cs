using Microsoft.EntityFrameworkCore;
using SalesAnalytics.Core.Entities;

namespace SalesAnalytics.Infrastructure.Data;

/// <summary>EF Core DbContext – schema public (OLTP)</summary>
public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

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
            // Extended profile columns (PROMPT 6)
            e.Property(u => u.AvatarUrl).HasColumnName("avatar_url").HasMaxLength(500);
            e.Property(u => u.Phone).HasColumnName("phone").HasMaxLength(20);
            e.Property(u => u.Birthdate).HasColumnName("birthdate");
            e.Property(u => u.Timezone).HasColumnName("timezone").HasMaxLength(50).HasDefaultValue("Asia/Ho_Chi_Minh");
            e.Property(u => u.LangPref).HasColumnName("lang_pref").HasMaxLength(10).HasDefaultValue("vi");
            e.HasIndex(u => u.Username).IsUnique();
            e.HasIndex(u => u.Email).IsUnique();
        });

        // ── Category ─────────────────────────────────────────────────────────
        modelBuilder.Entity<Category>(e =>
        {
            // Bảng và cột đã khai báo qua [Table] / [Column] attributes
            // Cần cấu hình self-reference FK và giá trị mặc định
            e.HasOne(c => c.Parent)
             .WithMany(c => c.Children)
             .HasForeignKey(c => c.ParentId)
             .OnDelete(DeleteBehavior.SetNull);

            e.Property(c => c.Level).HasDefaultValue((short)1);
            e.Property(c => c.IsActive).HasDefaultValue(true);
            e.Property(c => c.CreatedAt).HasDefaultValueSql("NOW()");
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
            e.HasIndex(k => new { k.Keyword, k.SourceType }).IsUnique();
            e.HasIndex(k => new { k.IsActive, k.SourceType });
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
