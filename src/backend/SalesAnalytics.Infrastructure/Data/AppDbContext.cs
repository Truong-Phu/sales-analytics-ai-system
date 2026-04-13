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
            e.HasKey(u => u.Id);
            e.Property(u => u.Username).HasMaxLength(50).IsRequired();
            e.Property(u => u.Email).HasMaxLength(100);
            e.Property(u => u.FullName).HasMaxLength(100);
            e.Property(u => u.Role).HasConversion<string>().HasMaxLength(20);
            e.Property(u => u.PasswordHash).HasMaxLength(256);
            e.Property(u => u.PreferredLanguage).HasMaxLength(5).HasDefaultValue("vi");
            e.HasIndex(u => u.Username).IsUnique();
            e.HasIndex(u => u.Email).IsUnique();
        });
    }
}
