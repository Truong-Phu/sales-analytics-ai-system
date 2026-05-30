using System.ComponentModel.DataAnnotations;

namespace SalesAnalytics.Core.DTOs;

/// <summary>Dữ liệu sản phẩm trả về cho client</summary>
public class ProductResponseDto
{
    public int     ProductId     { get; set; }
    public string  Sku           { get; set; } = string.Empty;
    public string  ProductName   { get; set; } = string.Empty;
    public string? Description   { get; set; }
    public decimal BasePrice     { get; set; }
    public decimal? CostPrice    { get; set; }
    public int     StockQuantity { get; set; }
    public int     CategoryId    { get; set; }
    public string? CategoryName  { get; set; }
    public string? ImageUrl      { get; set; }
    public bool    IsActive       { get; set; }
    public DateTime CreatedAt    { get; set; }
    public DateTime UpdatedAt    { get; set; }
    public int     VariationCount { get; set; }  // Số biến thể đang active
}

/// <summary>Dữ liệu tạo sản phẩm mới</summary>
public class CreateProductDto
{
    [Required(ErrorMessage = "SKU là bắt buộc")]
    [MaxLength(100)]
    public string Sku { get; set; } = string.Empty;

    [Required(ErrorMessage = "Tên sản phẩm là bắt buộc")]
    [MaxLength(500)]
    public string ProductName { get; set; } = string.Empty;

    public string? Description { get; set; }

    [Range(0, double.MaxValue, ErrorMessage = "Giá bán phải >= 0")]
    public decimal BasePrice { get; set; }

    [Range(0, double.MaxValue, ErrorMessage = "Giá vốn phải >= 0")]
    public decimal? CostPrice { get; set; }

    [Range(0, int.MaxValue, ErrorMessage = "Số lượng tồn kho phải >= 0")]
    public int StockQuantity { get; set; } = 0;

    [Required(ErrorMessage = "Danh mục là bắt buộc")]
    public int CategoryId { get; set; }

    public string? ImageUrl { get; set; }
}

/// <summary>Dữ liệu cập nhật sản phẩm</summary>
public class UpdateProductDto
{
    [MaxLength(100)]
    public string? Sku { get; set; }

    [MaxLength(500)]
    public string? ProductName { get; set; }

    public string? Description { get; set; }

    [Range(0, double.MaxValue)]
    public decimal? BasePrice { get; set; }

    [Range(0, double.MaxValue)]
    public decimal? CostPrice { get; set; }

    [Range(0, int.MaxValue)]
    public int? StockQuantity { get; set; }

    public int? CategoryId { get; set; }
    public string? ImageUrl { get; set; }
    public bool? IsActive { get; set; }
}
