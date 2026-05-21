using Microsoft.EntityFrameworkCore;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Infrastructure.Data;
using SalesAnalytics.Infrastructure.Repositories;

namespace SalesAnalytics.Tests;

/// <summary>
/// Unit test cho OrderRepository – dùng EF Core InMemory database.
/// Kiểm tra: GetById, GetAll, GetFilteredAsync (lọc status, channelId, search).
/// </summary>
public class OrderRepositoryTests : IDisposable
{
    private readonly AppDbContext    _db;
    private readonly OrderRepository _repo;

    // Channel IDs cho test
    private const int ShopeeChannelId = 1;
    private const int LazadaChannelId = 2;

    public OrderRepositoryTests()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"OrderDb_{Guid.NewGuid()}")
            .Options;

        _db   = new AppDbContext(options);
        _repo = new OrderRepository(_db);

        SeedData();
    }

    private void SeedData()
    {
        var customer = new Customer
        {
            CustomerCode = "C001",
            FullName     = "Nguyễn Văn A",
            Phone        = "0901234567",
            Email        = "a@example.com",
            TotalSpent   = 500_000,
            IsActive     = true,
        };
        var shopee = new Channel { ChannelName = "Shopee", ChannelType = "SHOPEE", IsActive = true };
        var lazada = new Channel { ChannelName = "Lazada", ChannelType = "LAZADA", IsActive = true };
        _db.Customers.Add(customer);
        _db.Set<Channel>().AddRange(shopee, lazada);
        _db.SaveChanges();

        _db.Orders.AddRange(
            new Order
            {
                OrderCode   = "ORD-001",
                CustomerId  = customer.CustomerId,
                ChannelId   = shopee.ChannelId,
                OrderDate   = new DateTime(2025, 10, 1, 0, 0, 0, DateTimeKind.Utc),
                TotalAmount = 500_000,
                Status      = "DELIVERED",
                CreatedAt   = DateTime.UtcNow,
            },
            new Order
            {
                OrderCode   = "ORD-002",
                CustomerId  = customer.CustomerId,
                ChannelId   = lazada.ChannelId,
                OrderDate   = new DateTime(2025, 11, 15, 0, 0, 0, DateTimeKind.Utc),
                TotalAmount = 1_200_000,
                Status      = "DELIVERED",
                CreatedAt   = DateTime.UtcNow,
            },
            new Order
            {
                OrderCode   = "ORD-003",
                CustomerId  = customer.CustomerId,
                ChannelId   = shopee.ChannelId,
                OrderDate   = new DateTime(2025, 12, 1, 0, 0, 0, DateTimeKind.Utc),
                TotalAmount = 300_000,
                Status      = "CANCELLED",
                CreatedAt   = DateTime.UtcNow,
            }
        );
        _db.SaveChanges();
    }

    // ── Test cases ────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "OrderRepository")]
    public async Task GetByIdAsync_ExistingOrder_ReturnsOrder()
    {
        var existing = _db.Orders.First();

        var result = await _repo.GetByIdAsync(existing.OrderId);

        Assert.NotNull(result);
        Assert.Equal(existing.OrderCode, result.OrderCode);
    }

    [Fact]
    [Trait("Category", "OrderRepository")]
    public async Task GetByIdAsync_NonExistingId_ReturnsNull()
    {
        var result = await _repo.GetByIdAsync(99999);

        Assert.Null(result);
    }

    [Fact]
    [Trait("Category", "OrderRepository")]
    public async Task GetAllAsync_ReturnsAllSeededOrders()
    {
        var result = (await _repo.GetAllAsync()).ToList();

        Assert.Equal(3, result.Count);
    }

    [Fact]
    [Trait("Category", "OrderRepository")]
    public async Task GetFilteredAsync_FilterByStatus_ReturnsMatchingOrders()
    {
        var shopeeChannel = _db.Set<Channel>().First(c => c.ChannelType == "SHOPEE");

        // Lọc shopee channel (2 đơn)
        var (items, total) = await _repo.GetFilteredAsync(
            search:    null,
            status:    null,
            channelId: shopeeChannel.ChannelId,
            page:      1,
            pageSize:  10
        );

        Assert.Equal(2, total);
        Assert.All(items, o => Assert.Equal(shopeeChannel.ChannelId, o.ChannelId));
    }

    [Fact]
    [Trait("Category", "OrderRepository")]
    public async Task GetFilteredAsync_FilterByStatusCancelled_ReturnsOne()
    {
        var (items, total) = await _repo.GetFilteredAsync(
            search:    null,
            status:    "CANCELLED",
            channelId: null,
            page:      1,
            pageSize:  10
        );

        Assert.Equal(1, total);
        Assert.Equal("ORD-003", items.First().OrderCode);
    }

    [Fact(Skip = "ILike là PostgreSQL-specific, không chạy được với InMemory EF — cần integration test")]
    [Trait("Category", "OrderRepository")]
    public async Task GetFilteredAsync_SearchByCode_ReturnsMatchingOrder()
    {
        // Test này cần database PostgreSQL thật (ILike không hỗ trợ InMemory provider).
        // Chạy với: dotnet test --filter "Category=Integration"
        var (items, total) = await _repo.GetFilteredAsync(
            search:    "ORD-002",
            status:    null,
            channelId: null,
            page:      1,
            pageSize:  10
        );

        Assert.Equal(1, total);
        Assert.Equal("ORD-002", items.First().OrderCode);
    }

    // ── Teardown ──────────────────────────────────────────────────────────────
    public void Dispose() => _db.Dispose();
}
