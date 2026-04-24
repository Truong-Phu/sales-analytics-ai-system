using SalesAnalytics.Core.Entities;

namespace SalesAnalytics.Core.Interfaces;

/// <summary>Repository kênh bán hàng – thêm các truy vấn nghiệp vụ đặc thù</summary>
public interface IChannelRepository : IRepository<Channel>
{
    /// <summary>Lấy tất cả kênh đang hoạt động (is_active = true)</summary>
    Task<IEnumerable<Channel>> GetActiveChannelsAsync();

    /// <summary>Lấy kênh theo loại (SHOPEE, LAZADA, TIKTOK_SHOP...)</summary>
    Task<IEnumerable<Channel>> GetByTypeAsync(string channelType);

    /// <summary>Cập nhật trạng thái đồng bộ và thời điểm sync gần nhất</summary>
    Task UpdateSyncStatusAsync(int channelId, string status, DateTime? lastSyncAt = null);
}
