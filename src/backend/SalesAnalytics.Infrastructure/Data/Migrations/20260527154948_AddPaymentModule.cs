using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace SalesAnalytics.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPaymentModule : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "phone_number",
                schema: "public",
                table: "customers");

            migrationBuilder.AddColumn<string>(
                name: "brand",
                schema: "public",
                table: "products",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "condition",
                schema: "public",
                table: "products",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "currency",
                schema: "public",
                table: "products",
                type: "character varying(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "days_to_ship",
                schema: "public",
                table: "products",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "has_model",
                schema: "public",
                table: "products",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "image_url_list",
                schema: "public",
                table: "products",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_pre_order",
                schema: "public",
                table: "products",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "item_sku",
                schema: "public",
                table: "products",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "lazada_item_id",
                schema: "public",
                table: "products",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "lazada_primary_category",
                schema: "public",
                table: "products",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "original_price",
                schema: "public",
                table: "products",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "package_height",
                schema: "public",
                table: "products",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "package_length",
                schema: "public",
                table: "products",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "package_width",
                schema: "public",
                table: "products",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "platform_created_at",
                schema: "public",
                table: "products",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "platform_status",
                schema: "public",
                table: "products",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "platform_updated_at",
                schema: "public",
                table: "products",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "reserved_stock",
                schema: "public",
                table: "products",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<decimal>(
                name: "sale_price",
                schema: "public",
                table: "products",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "shopee_category_id",
                schema: "public",
                table: "products",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "shopee_item_id",
                schema: "public",
                table: "products",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "tiktok_category_id",
                schema: "public",
                table: "products",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "tiktok_product_id",
                schema: "public",
                table: "products",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "video_url",
                schema: "public",
                table: "products",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "weight",
                schema: "public",
                table: "products",
                type: "numeric",
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "payment_method",
                schema: "public",
                table: "orders",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(50)",
                oldMaxLength: 50,
                oldNullable: true);

            migrationBuilder.AddColumn<string>(
                name: "buyer_username",
                schema: "public",
                table: "orders",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "cancel_by",
                schema: "public",
                table: "orders",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "cancel_reason",
                schema: "public",
                table: "orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "channel_type",
                schema: "public",
                table: "orders",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "created_by_user_id",
                schema: "public",
                table: "orders",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "currency",
                schema: "public",
                table: "orders",
                type: "character varying(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "customer_email",
                schema: "public",
                table: "orders",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "customer_name",
                schema: "public",
                table: "orders",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "customer_phone",
                schema: "public",
                table: "orders",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "days_to_ship",
                schema: "public",
                table: "orders",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "expected_delivery_at",
                schema: "public",
                table: "orders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "fulfillment_type",
                schema: "public",
                table: "orders",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ghn_order_code",
                schema: "public",
                table: "orders",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_cod",
                schema: "public",
                table: "orders",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "logistics_status",
                schema: "public",
                table: "orders",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "note",
                schema: "public",
                table: "orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "original_shipping_fee",
                schema: "public",
                table: "orders",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "original_total",
                schema: "public",
                table: "orders",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "paid_at",
                schema: "public",
                table: "orders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "platform_created_at",
                schema: "public",
                table: "orders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "platform_discount",
                schema: "public",
                table: "orders",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "platform_order_id",
                schema: "public",
                table: "orders",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "platform_status",
                schema: "public",
                table: "orders",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "platform_updated_at",
                schema: "public",
                table: "orders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "pos_note",
                schema: "public",
                table: "orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "seller_discount",
                schema: "public",
                table: "orders",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<DateTime>(
                name: "ship_by_date",
                schema: "public",
                table: "orders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "shipped_at",
                schema: "public",
                table: "orders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "shipping_address",
                schema: "public",
                table: "orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "shipping_carrier",
                schema: "public",
                table: "orders",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "shipping_country",
                schema: "public",
                table: "orders",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "shipping_district",
                schema: "public",
                table: "orders",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "shipping_fee_platform_discount",
                schema: "public",
                table: "orders",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "shipping_fee_seller_discount",
                schema: "public",
                table: "orders",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "shipping_full_address",
                schema: "public",
                table: "orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "shipping_name",
                schema: "public",
                table: "orders",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "shipping_phone",
                schema: "public",
                table: "orders",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "shipping_province",
                schema: "public",
                table: "orders",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "shipping_ward",
                schema: "public",
                table: "orders",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "shipping_zipcode",
                schema: "public",
                table: "orders",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "subtotal",
                schema: "public",
                table: "orders",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "tax_amount",
                schema: "public",
                table: "orders",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "tracking_number",
                schema: "public",
                table: "orders",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "voucher_amount",
                schema: "public",
                table: "orders",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "voucher_code",
                schema: "public",
                table: "orders",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "created_at",
                schema: "public",
                table: "order_items",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<string>(
                name: "currency",
                schema: "public",
                table: "order_items",
                type: "character varying(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "image_url",
                schema: "public",
                table: "order_items",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "model_id",
                schema: "public",
                table: "order_items",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "original_price",
                schema: "public",
                table: "order_items",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "package_id",
                schema: "public",
                table: "order_items",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "package_status",
                schema: "public",
                table: "order_items",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "platform_discount",
                schema: "public",
                table: "order_items",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "platform_item_id",
                schema: "public",
                table: "order_items",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "platform_order_item_id",
                schema: "public",
                table: "order_items",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "product_name",
                schema: "public",
                table: "order_items",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "promotion_id",
                schema: "public",
                table: "order_items",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "promotion_type",
                schema: "public",
                table: "order_items",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "sale_price",
                schema: "public",
                table: "order_items",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "seller_discount",
                schema: "public",
                table: "order_items",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "sku",
                schema: "public",
                table: "order_items",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "sku_id",
                schema: "public",
                table: "order_items",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "tracking_number",
                schema: "public",
                table: "order_items",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "variation_name",
                schema: "public",
                table: "order_items",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "weight",
                schema: "public",
                table: "order_items",
                type: "numeric",
                nullable: true);

            migrationBuilder.AlterColumn<int>(
                name: "job_id",
                schema: "public",
                table: "etl_logs",
                type: "integer",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AddColumn<decimal>(
                name: "avg_order_value",
                schema: "public",
                table: "customers",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "birthday",
                schema: "public",
                table: "customers",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "first_name",
                schema: "public",
                table: "customers",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "first_order_at",
                schema: "public",
                table: "customers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "full_address",
                schema: "public",
                table: "customers",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "last_name",
                schema: "public",
                table: "customers",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "last_order_at",
                schema: "public",
                table: "customers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "lazada_customer_id",
                schema: "public",
                table: "customers",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "loyalty_points",
                schema: "public",
                table: "customers",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "loyalty_tier",
                schema: "public",
                table: "customers",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "phone",
                schema: "public",
                table: "customers",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "primary_channel",
                schema: "public",
                table: "customers",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "rfm_f_score",
                schema: "public",
                table: "customers",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "rfm_m_score",
                schema: "public",
                table: "customers",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "rfm_r_score",
                schema: "public",
                table: "customers",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "rfm_score",
                schema: "public",
                table: "customers",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "rfm_segment",
                schema: "public",
                table: "customers",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "rfm_updated_at",
                schema: "public",
                table: "customers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "shopee_buyer_id",
                schema: "public",
                table: "customers",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "tiktok_user_id",
                schema: "public",
                table: "customers",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "username",
                schema: "public",
                table: "customers",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ward",
                schema: "public",
                table: "customers",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "payment_method_configs",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    payment_method = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    enabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    config_json = table.Column<string>(type: "jsonb", nullable: true),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_payment_method_configs", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "payment_transactions",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    order_id = table.Column<int>(type: "integer", nullable: true),
                    invoice_id = table.Column<Guid>(type: "uuid", nullable: true),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    payment_code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    payment_method = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    amount = table.Column<decimal>(type: "numeric(15,2)", nullable: false),
                    currency = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "VND"),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "Pending"),
                    transaction_code = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    gateway_response = table.Column<string>(type: "jsonb", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    paid_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    expired_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    created_by = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_payment_transactions", x => x.id);
                    table.ForeignKey(
                        name: "FK_payment_transactions_invoices_invoice_id",
                        column: x => x.invoice_id,
                        principalSchema: "public",
                        principalTable: "invoices",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_payment_transactions_orders_order_id",
                        column: x => x.order_id,
                        principalSchema: "public",
                        principalTable: "orders",
                        principalColumn: "order_id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_payment_transactions_users_created_by",
                        column: x => x.created_by,
                        principalSchema: "public",
                        principalTable: "users",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "payment_webhook_logs",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    provider = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    payload = table.Column<string>(type: "jsonb", nullable: false),
                    signature = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    processed_status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "PENDING"),
                    notes = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_payment_webhook_logs", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "product_variations",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    company_id = table.Column<Guid>(type: "uuid", nullable: false),
                    product_id = table.Column<int>(type: "integer", nullable: false),
                    shopee_model_id = table.Column<long>(type: "bigint", nullable: true),
                    tiktok_sku_id = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    lazada_sku_id = table.Column<long>(type: "bigint", nullable: true),
                    sku = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    variation_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    attribute_color = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    attribute_size = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    original_price = table.Column<decimal>(type: "numeric(15,2)", nullable: true),
                    sale_price = table.Column<decimal>(type: "numeric(15,2)", nullable: true),
                    currency = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "VND"),
                    stock_quantity = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    warehouse_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    image_url = table.Column<string>(type: "text", nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    platform_status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_product_variations", x => x.id);
                    table.ForeignKey(
                        name: "FK_product_variations_products_product_id",
                        column: x => x.product_id,
                        principalSchema: "public",
                        principalTable: "products",
                        principalColumn: "product_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_payment_method_configs_payment_method",
                schema: "public",
                table: "payment_method_configs",
                column: "payment_method",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_payment_transactions_created_by",
                schema: "public",
                table: "payment_transactions",
                column: "created_by");

            migrationBuilder.CreateIndex(
                name: "IX_payment_transactions_invoice_id",
                schema: "public",
                table: "payment_transactions",
                column: "invoice_id");

            migrationBuilder.CreateIndex(
                name: "IX_payment_transactions_order_id",
                schema: "public",
                table: "payment_transactions",
                column: "order_id");

            migrationBuilder.CreateIndex(
                name: "IX_payment_transactions_payment_code",
                schema: "public",
                table: "payment_transactions",
                column: "payment_code");

            migrationBuilder.CreateIndex(
                name: "IX_payment_transactions_status_created_at",
                schema: "public",
                table: "payment_transactions",
                columns: new[] { "status", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_payment_transactions_tenant_id",
                schema: "public",
                table: "payment_transactions",
                column: "tenant_id");

            migrationBuilder.CreateIndex(
                name: "IX_payment_webhook_logs_provider_created_at",
                schema: "public",
                table: "payment_webhook_logs",
                columns: new[] { "provider", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_product_variations_company_id_sku",
                schema: "public",
                table: "product_variations",
                columns: new[] { "company_id", "sku" });

            migrationBuilder.CreateIndex(
                name: "IX_product_variations_product_id_sku",
                schema: "public",
                table: "product_variations",
                columns: new[] { "product_id", "sku" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "payment_method_configs",
                schema: "public");

            migrationBuilder.DropTable(
                name: "payment_transactions",
                schema: "public");

            migrationBuilder.DropTable(
                name: "payment_webhook_logs",
                schema: "public");

            migrationBuilder.DropTable(
                name: "product_variations",
                schema: "public");

            migrationBuilder.DropColumn(
                name: "brand",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "condition",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "currency",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "days_to_ship",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "has_model",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "image_url_list",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "is_pre_order",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "item_sku",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "lazada_item_id",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "lazada_primary_category",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "original_price",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "package_height",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "package_length",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "package_width",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "platform_created_at",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "platform_status",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "platform_updated_at",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "reserved_stock",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "sale_price",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "shopee_category_id",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "shopee_item_id",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "tiktok_category_id",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "tiktok_product_id",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "video_url",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "weight",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "buyer_username",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "cancel_by",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "cancel_reason",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "channel_type",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "created_by_user_id",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "currency",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "customer_email",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "customer_name",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "customer_phone",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "days_to_ship",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "expected_delivery_at",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "fulfillment_type",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "ghn_order_code",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "is_cod",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "logistics_status",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "note",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "original_shipping_fee",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "original_total",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "paid_at",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "platform_created_at",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "platform_discount",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "platform_order_id",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "platform_status",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "platform_updated_at",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "pos_note",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "seller_discount",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "ship_by_date",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipped_at",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipping_address",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipping_carrier",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipping_country",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipping_district",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipping_fee_platform_discount",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipping_fee_seller_discount",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipping_full_address",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipping_name",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipping_phone",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipping_province",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipping_ward",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "shipping_zipcode",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "subtotal",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "tax_amount",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "tracking_number",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "voucher_amount",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "voucher_code",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "created_at",
                schema: "public",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "currency",
                schema: "public",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "image_url",
                schema: "public",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "model_id",
                schema: "public",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "original_price",
                schema: "public",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "package_id",
                schema: "public",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "package_status",
                schema: "public",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "platform_discount",
                schema: "public",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "platform_item_id",
                schema: "public",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "platform_order_item_id",
                schema: "public",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "product_name",
                schema: "public",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "promotion_id",
                schema: "public",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "promotion_type",
                schema: "public",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "sale_price",
                schema: "public",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "seller_discount",
                schema: "public",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "sku",
                schema: "public",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "sku_id",
                schema: "public",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "tracking_number",
                schema: "public",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "variation_name",
                schema: "public",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "weight",
                schema: "public",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "avg_order_value",
                schema: "public",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "birthday",
                schema: "public",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "first_name",
                schema: "public",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "first_order_at",
                schema: "public",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "full_address",
                schema: "public",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "last_name",
                schema: "public",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "last_order_at",
                schema: "public",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "lazada_customer_id",
                schema: "public",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "loyalty_points",
                schema: "public",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "loyalty_tier",
                schema: "public",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "phone",
                schema: "public",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "primary_channel",
                schema: "public",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "rfm_f_score",
                schema: "public",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "rfm_m_score",
                schema: "public",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "rfm_r_score",
                schema: "public",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "rfm_score",
                schema: "public",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "rfm_segment",
                schema: "public",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "rfm_updated_at",
                schema: "public",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "shopee_buyer_id",
                schema: "public",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "tiktok_user_id",
                schema: "public",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "username",
                schema: "public",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "ward",
                schema: "public",
                table: "customers");

            migrationBuilder.AlterColumn<string>(
                name: "payment_method",
                schema: "public",
                table: "orders",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(100)",
                oldMaxLength: 100,
                oldNullable: true);

            migrationBuilder.AlterColumn<int>(
                name: "job_id",
                schema: "public",
                table: "etl_logs",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.AddColumn<string>(
                name: "phone_number",
                schema: "public",
                table: "customers",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);
        }
    }
}
