namespace SalesAnalytics.Core.DTOs;

/// <summary>Kết quả phân trang generic – dùng cho mọi endpoint trả về danh sách</summary>
public class PagedResult<T>
{
    public PagedResult() { }

    public PagedResult(IEnumerable<T> data, int total, int page, int pageSize)
    {
        Data     = data;
        Total    = total;
        Page     = page;
        PageSize = pageSize;
    }

    /// <summary>Danh sách bản ghi trong trang hiện tại</summary>
    public IEnumerable<T> Data { get; set; } = [];

    /// <summary>Tổng số bản ghi (tất cả trang)</summary>
    public int Total { get; set; }

    /// <summary>Trang hiện tại (bắt đầu từ 1)</summary>
    public int Page { get; set; }

    /// <summary>Số bản ghi mỗi trang</summary>
    public int PageSize { get; set; }

    /// <summary>Tổng số trang</summary>
    public int TotalPages => PageSize > 0 ? (int)Math.Ceiling((double)Total / PageSize) : 0;

    /// <summary>Có trang tiếp theo không</summary>
    public bool HasNext => Page < TotalPages;

    /// <summary>Có trang trước không</summary>
    public bool HasPrev => Page > 1;
}

/// <summary>Tham số phân trang từ query string</summary>
public class PaginationParams
{
    private int _page = 1;
    private int _pageSize = 20;

    /// <summary>Số trang (mặc định: 1)</summary>
    public int Page
    {
        get => _page;
        set => _page = value < 1 ? 1 : value;
    }

    /// <summary>Số bản ghi mỗi trang (mặc định: 20, tối đa: 200)</summary>
    public int PageSize
    {
        get => _pageSize;
        set => _pageSize = value < 1 ? 20 : value > 200 ? 200 : value;
    }
}
