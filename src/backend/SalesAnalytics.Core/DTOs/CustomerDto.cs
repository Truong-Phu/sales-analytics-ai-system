using System.ComponentModel.DataAnnotations;

namespace SalesAnalytics.Core.DTOs;

/// <summary>Dữ liệu khách hàng trả về cho client</summary>
public class CustomerResponseDto
{
    public int     CustomerId    { get; set; }
    public string? CustomerCode { get; set; }
    public string  FullName     { get; set; } = string.Empty;
    public string? Email        { get; set; }
    public string? Phone        { get; set; }
    public string? Address      { get; set; }
    public string? Province     { get; set; }
    public int     TotalOrders  { get; set; }
    public decimal TotalSpent   { get; set; }
    public string? SegmentLabel { get; set; }
    public bool    IsActive     { get; set; }
    public DateTime CreatedAt   { get; set; }
}

/// <summary>Dữ liệu tạo khách hàng mới</summary>
public class CreateCustomerDto
{
    [Required(ErrorMessage = "Họ tên là bắt buộc")]
    [MaxLength(255)]
    public string FullName { get; set; } = string.Empty;

    [MaxLength(255)]
    [EmailAddress(ErrorMessage = "Định dạng email không hợp lệ")]
    public string? Email { get; set; }

    [MaxLength(30)]
    public string? Phone { get; set; }

    public string? Address  { get; set; }
    public string? Province { get; set; }
    public string? District { get; set; }
}

/// <summary>Dữ liệu cập nhật thông tin khách hàng</summary>
public class UpdateCustomerDto
{
    [MaxLength(255)]
    public string? FullName { get; set; }

    [MaxLength(255)]
    [EmailAddress]
    public string? Email { get; set; }

    [MaxLength(30)]
    public string? Phone { get; set; }

    public string? Address      { get; set; }
    public string? Province     { get; set; }
    public string? District     { get; set; }
    public string? SegmentLabel { get; set; }
    public bool?   IsActive     { get; set; }
}
