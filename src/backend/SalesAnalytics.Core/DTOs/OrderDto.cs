using System.ComponentModel.DataAnnotations;

namespace SalesAnalytics.Core.DTOs;

/// <summary>Dữ liệu đơn hàng trả về cho client</summary>
public class OrderResponseDto
{
    public int     OrderId          { get; set; }
    public string  OrderCode        { get; set; } = string.Empty;
    public int     CustomerId       { get; set; }
    public string? CustomerName     { get; set; }
    public int     ChannelId        { get; set; }
    public string? ChannelName      { get; set; }
    public string  Status           { get; set; } = string.Empty;
    public decimal TotalAmount      { get; set; }
    public decimal DiscountAmount   { get; set; }
    public decimal ShippingFee      { get; set; }
    public string? PaymentMethod    { get; set; }
    public string  PaymentStatus    { get; set; } = string.Empty;
    public string  ShippingStatus   { get; set; } = string.Empty;
    public DateTime OrderDate       { get; set; }
    public DateTime? DeliveredAt    { get; set; }
    public string? ExternalOrderId  { get; set; }
    public string? TrackingNumber        { get; set; }
    public string? GhnOrderCode          { get; set; }
    public string? CustomerPhone         { get; set; }
    public string? ShippingAddress       { get; set; }
    public string? ShippingDistrict      { get; set; }
    public string? ShippingProvince      { get; set; }
    public string? ShippingFullAddress   { get; set; }
    public string? PlatformStatus        { get; set; }
    public DateTime? PaidAt              { get; set; }
    public string? PosNote               { get; set; }
    public DateTime CreatedAt            { get; set; }
    public List<OrderDetailDto> Details  { get; set; } = [];
}

/// <summary>Chi tiết từng sản phẩm trong đơn hàng</summary>
public class OrderDetailDto
{
    public int     ItemId      { get; set; }
    public int     ProductId   { get; set; }
    public string? ProductName { get; set; }
    public string? Sku         { get; set; }
    public string? Variation   { get; set; }
    public string? ImageUrl    { get; set; }
    public int     Quantity    { get; set; }
    public decimal UnitPrice   { get; set; }
    public decimal Discount    { get; set; }
    public decimal Subtotal    { get; set; }
}

/// <summary>Dữ liệu tạo đơn hàng mới</summary>
public class CreateOrderDto
{
    [Required(ErrorMessage = "Khách hàng là bắt buộc")]
    public int CustomerId { get; set; }

    [Required(ErrorMessage = "Kênh bán hàng là bắt buộc")]
    public int ChannelId { get; set; }

    [Range(0, double.MaxValue, ErrorMessage = "Tổng tiền phải >= 0")]
    public decimal TotalAmount { get; set; }

    public decimal DiscountAmount { get; set; } = 0;
    public decimal ShippingFee    { get; set; } = 0;

    [MaxLength(50)]
    public string? PaymentMethod { get; set; }

    [Required(ErrorMessage = "Ngày đặt hàng là bắt buộc")]
    public DateTime OrderDate { get; set; }

    public string? ExternalOrderId { get; set; }

    [Required(ErrorMessage = "Đơn hàng phải có ít nhất 1 sản phẩm")]
    [MinLength(1, ErrorMessage = "Đơn hàng phải có ít nhất 1 sản phẩm")]
    public List<CreateOrderDetailDto> Items { get; set; } = [];
}

/// <summary>Dữ liệu chi tiết sản phẩm khi tạo đơn</summary>
public class CreateOrderDetailDto
{
    [Required]
    public int ProductId { get; set; }

    [Range(1, int.MaxValue, ErrorMessage = "Số lượng phải >= 1")]
    public int Quantity { get; set; }

    [Range(0, double.MaxValue)]
    public decimal UnitPrice { get; set; }

    public decimal Discount { get; set; } = 0;
}

/// <summary>Dữ liệu cập nhật trạng thái đơn hàng</summary>
public class UpdateOrderDto
{
    [MaxLength(50)]
    public string? Status { get; set; }

    [MaxLength(50)]
    public string? PaymentStatus { get; set; }

    [MaxLength(50)]
    public string? ShippingStatus { get; set; }

    public DateTime? DeliveredAt { get; set; }
}
