using Microsoft.EntityFrameworkCore;
using SalesAnalytics.Core.Entities;

namespace SalesAnalytics.Infrastructure.Data;

/// <summary>EF Core DbContext – chỉ dùng cho schema public (Auth, Users)</summary>
public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Bảng users trong schema public
        modelBuilder.Entity<User>(e =>
        {
            e.ToTable("users", "public");

            // Bắt buộc map tường minh sang snake_case vì PostgreSQL phân biệt hoa/thường
            // khi Npgsql quote identifier. Nếu thiếu HasColumnName, EF Core sinh SQL
            // dạng u."Id" thay vì u.id → lỗi 42703 column does not exist.
            e.HasKey(u => u.Id);
            e.Property(u => u.Id).HasColumnName("id");
            e.Property(u => u.Username).HasColumnName("username").HasMaxLength(50).IsRequired();
            e.Property(u => u.PasswordHash).HasColumnName("password_hash").HasMaxLength(256);
            e.Property(u => u.Email).HasColumnName("email").HasMaxLength(100);
            e.Property(u => u.FullName).HasColumnName("full_name").HasMaxLength(100);
            e.Property(u => u.Role).HasColumnName("role").HasConversion<string>().HasMaxLength(20);
            e.Property(u => u.IsActive).HasColumnName("is_active");
            e.Property(u => u.PreferredLanguage).HasColumnName("preferred_language").HasMaxLength(5).HasDefaultValue("vi");
            e.Property(u => u.CreatedAt).HasColumnName("created_at");
            e.Property(u => u.LastLoginAt).HasColumnName("last_login_at");
            e.Property(u => u.RefreshToken).HasColumnName("refresh_token");
            e.Property(u => u.RefreshTokenExpiresAt).HasColumnName("refresh_token_expires_at");

            e.HasIndex(u => u.Username).IsUnique();
            e.HasIndex(u => u.Email).IsUnique();
        });
    }
}
