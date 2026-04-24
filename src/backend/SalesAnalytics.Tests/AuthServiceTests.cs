using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using SalesAnalytics.API.Services;
using SalesAnalytics.Core.DTOs;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.Tests;

/// <summary>
/// Unit test cho AuthService.
/// Dùng EF Core InMemory + RegisterAsync để seed user với đúng hash PBKDF2.
/// </summary>
public class AuthServiceTests : IDisposable
{
    private readonly AppDbContext _db;
    private readonly AuthService  _sut;

    private const string TestUsername = "testuser";
    private const string TestPassword = "correct-password";

    public AuthServiceTests()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"TestDb_{Guid.NewGuid()}")
            .Options;

        _db = new AppDbContext(options);

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Secret"]        = "super-secret-key-for-testing-only-32chars",
                ["Jwt:Issuer"]        = "TestIssuer",
                ["Jwt:Audience"]      = "TestAudience",
                ["Jwt:ExpireMinutes"] = "60",
            })
            .Build();

        _sut = new AuthService(_db, new JwtService(config), config);

        // Seed: đăng ký user → activate thủ công (bypass approval flow cho test)
        _sut.RegisterAsync(new RegisterRequest(
            TestUsername, TestPassword, "test@example.com", "Test User"
        )).GetAwaiter().GetResult();

        var user = _db.Users.Single(u => u.Username == TestUsername);
        user.IsActive = true;
        _db.SaveChanges();
    }

    // ── Test cases ────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "Auth")]
    public async Task LoginAsync_ValidCredentials_ReturnsAuthResponse()
    {
        var result = await _sut.LoginAsync(new LoginRequest(TestUsername, TestPassword));

        Assert.NotNull(result);
        Assert.NotEmpty(result.AccessToken);
        Assert.NotEmpty(result.RefreshToken);
        Assert.True(result.ExpiresAt > DateTime.UtcNow);
    }

    [Fact]
    [Trait("Category", "Auth")]
    public async Task LoginAsync_WrongPassword_ReturnsNull()
    {
        var result = await _sut.LoginAsync(new LoginRequest(TestUsername, "wrong-password"));

        Assert.Null(result);
    }

    [Fact]
    [Trait("Category", "Auth")]
    public async Task LoginAsync_NonExistentUser_ReturnsNull()
    {
        var result = await _sut.LoginAsync(new LoginRequest("ghost_user", "any-password"));

        Assert.Null(result);
    }

    [Fact]
    [Trait("Category", "Auth")]
    public async Task LoginAsync_InactiveUser_ReturnsNull()
    {
        // Đăng ký user khác nhưng không activate
        await _sut.RegisterAsync(new RegisterRequest(
            "locked_user", "some-pass", "locked@example.com", "Locked User"
        ));
        // IsActive mặc định = false → không activate

        var result = await _sut.LoginAsync(new LoginRequest("locked_user", "some-pass"));

        Assert.Null(result);
    }

    [Fact]
    [Trait("Category", "Auth")]
    public async Task RegisterAsync_DuplicateUsername_ReturnsFalse()
    {
        var (success, message) = await _sut.RegisterAsync(
            new RegisterRequest(TestUsername, "any-pass", "other@test.com", "Other")
        );

        Assert.False(success);
        Assert.Contains("Tên đăng nhập", message);
    }

    // ── Teardown ──────────────────────────────────────────────────────────────
    public void Dispose() => _db.Dispose();
}
