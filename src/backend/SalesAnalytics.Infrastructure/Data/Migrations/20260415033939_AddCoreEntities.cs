using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace SalesAnalytics.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCoreEntities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "categories",
                schema: "public",
                columns: table => new
                {
                    category_id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    category_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    description = table.Column<string>(type: "text", nullable: true),
                    parent_id = table.Column<int>(type: "integer", nullable: true),
                    level = table.Column<short>(type: "smallint", nullable: false, defaultValue: (short)1),
                    is_active = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_categories", x => x.category_id);
                    table.ForeignKey(
                        name: "FK_categories_categories_parent_id",
                        column: x => x.parent_id,
                        principalSchema: "public",
                        principalTable: "categories",
                        principalColumn: "category_id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "etl_logs",
                schema: "public",
                columns: table => new
                {
                    log_id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    job_id = table.Column<int>(type: "integer", nullable: false),
                    phase = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false, defaultValue: "GENERAL"),
                    message = table.Column<string>(type: "text", nullable: true),
                    level = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "INFO"),
                    records_count = table.Column<int>(type: "integer", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_etl_logs", x => x.log_id);
                });

            migrationBuilder.CreateTable(
                name: "sales_channels",
                schema: "public",
                columns: table => new
                {
                    channel_id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    channel_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    channel_type = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    api_key = table.Column<string>(type: "text", nullable: true),
                    access_token = table.Column<string>(type: "text", nullable: true),
                    refresh_token_api = table.Column<string>(type: "text", nullable: true),
                    shop_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    last_sync_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    sync_status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "IDLE"),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_sales_channels", x => x.channel_id);
                });

            migrationBuilder.CreateTable(
                name: "products",
                schema: "public",
                columns: table => new
                {
                    product_id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    sku = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    product_name = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    description = table.Column<string>(type: "text", nullable: true),
                    base_price = table.Column<decimal>(type: "numeric", nullable: false),
                    cost_price = table.Column<decimal>(type: "numeric", nullable: true),
                    stock_quantity = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    category_id = table.Column<int>(type: "integer", nullable: false),
                    image_url = table.Column<string>(type: "text", nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_products", x => x.product_id);
                    table.ForeignKey(
                        name: "FK_products_categories_category_id",
                        column: x => x.category_id,
                        principalSchema: "public",
                        principalTable: "categories",
                        principalColumn: "category_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "customers",
                schema: "public",
                columns: table => new
                {
                    customer_id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    customer_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    full_name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    email = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    phone_number = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    address = table.Column<string>(type: "text", nullable: true),
                    province = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    district = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    total_orders = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    total_spent = table.Column<decimal>(type: "numeric", nullable: false, defaultValue: 0m),
                    segment_label = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_customers", x => x.customer_id);
                });

            migrationBuilder.CreateTable(
                name: "orders",
                schema: "public",
                columns: table => new
                {
                    order_id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    order_code = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    customer_id = table.Column<int>(type: "integer", nullable: false),
                    channel_id = table.Column<int>(type: "integer", nullable: false),
                    status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "PENDING"),
                    total_amount = table.Column<decimal>(type: "numeric", nullable: false),
                    discount_amount = table.Column<decimal>(type: "numeric", nullable: false, defaultValue: 0m),
                    shipping_fee = table.Column<decimal>(type: "numeric", nullable: false, defaultValue: 0m),
                    payment_method = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    payment_status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "UNPAID"),
                    shipping_status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "NOT_SHIPPED"),
                    order_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    delivered_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    external_order_id = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    net_amount = table.Column<decimal>(type: "numeric", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_orders", x => x.order_id);
                    table.ForeignKey(
                        name: "FK_orders_customers_customer_id",
                        column: x => x.customer_id,
                        principalSchema: "public",
                        principalTable: "customers",
                        principalColumn: "customer_id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_orders_sales_channels_channel_id",
                        column: x => x.channel_id,
                        principalSchema: "public",
                        principalTable: "sales_channels",
                        principalColumn: "channel_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "order_items",
                schema: "public",
                columns: table => new
                {
                    item_id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    order_id = table.Column<int>(type: "integer", nullable: false),
                    product_id = table.Column<int>(type: "integer", nullable: false),
                    quantity = table.Column<int>(type: "integer", nullable: false),
                    unit_price = table.Column<decimal>(type: "numeric", nullable: false),
                    discount = table.Column<decimal>(type: "numeric", nullable: false, defaultValue: 0m),
                    subtotal = table.Column<decimal>(type: "numeric", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_order_items", x => x.item_id);
                    table.ForeignKey(
                        name: "FK_order_items_orders_order_id",
                        column: x => x.order_id,
                        principalSchema: "public",
                        principalTable: "orders",
                        principalColumn: "order_id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_order_items_products_product_id",
                        column: x => x.product_id,
                        principalSchema: "public",
                        principalTable: "products",
                        principalColumn: "product_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "sales_data",
                schema: "public",
                columns: table => new
                {
                    sales_data_id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    order_id = table.Column<int>(type: "integer", nullable: true),
                    channel_id = table.Column<int>(type: "integer", nullable: false),
                    revenue = table.Column<decimal>(type: "numeric", nullable: false),
                    cost = table.Column<decimal>(type: "numeric", nullable: false, defaultValue: 0m),
                    profit = table.Column<decimal>(type: "numeric", nullable: false),
                    sale_date = table.Column<DateOnly>(type: "date", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_sales_data", x => x.sales_data_id);
                    table.ForeignKey(
                        name: "FK_sales_data_orders_order_id",
                        column: x => x.order_id,
                        principalSchema: "public",
                        principalTable: "orders",
                        principalColumn: "order_id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_sales_data_sales_channels_channel_id",
                        column: x => x.channel_id,
                        principalSchema: "public",
                        principalTable: "sales_channels",
                        principalColumn: "channel_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_categories_parent_id",
                schema: "public",
                table: "categories",
                column: "parent_id");

            migrationBuilder.CreateIndex(
                name: "IX_customers_customer_code",
                schema: "public",
                table: "customers",
                column: "customer_code",
                unique: true,
                filter: "customer_code IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_order_items_order_id",
                schema: "public",
                table: "order_items",
                column: "order_id");

            migrationBuilder.CreateIndex(
                name: "IX_order_items_product_id",
                schema: "public",
                table: "order_items",
                column: "product_id");

            migrationBuilder.CreateIndex(
                name: "IX_orders_channel_id",
                schema: "public",
                table: "orders",
                column: "channel_id");

            migrationBuilder.CreateIndex(
                name: "IX_orders_customer_id",
                schema: "public",
                table: "orders",
                column: "customer_id");

            migrationBuilder.CreateIndex(
                name: "IX_orders_external_order_id",
                schema: "public",
                table: "orders",
                column: "external_order_id",
                unique: true,
                filter: "external_order_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_orders_order_code",
                schema: "public",
                table: "orders",
                column: "order_code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_products_category_id",
                schema: "public",
                table: "products",
                column: "category_id");

            migrationBuilder.CreateIndex(
                name: "IX_products_sku",
                schema: "public",
                table: "products",
                column: "sku",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_sales_data_channel_id_sale_date",
                schema: "public",
                table: "sales_data",
                columns: new[] { "channel_id", "sale_date" });

            migrationBuilder.CreateIndex(
                name: "IX_sales_data_order_id",
                schema: "public",
                table: "sales_data",
                column: "order_id");

            migrationBuilder.CreateIndex(
                name: "IX_sales_data_sale_date",
                schema: "public",
                table: "sales_data",
                column: "sale_date");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "etl_logs",
                schema: "public");

            migrationBuilder.DropTable(
                name: "order_items",
                schema: "public");

            migrationBuilder.DropTable(
                name: "sales_data",
                schema: "public");

            migrationBuilder.DropTable(
                name: "products",
                schema: "public");

            migrationBuilder.DropTable(
                name: "orders",
                schema: "public");

            migrationBuilder.DropTable(
                name: "categories",
                schema: "public");

            migrationBuilder.DropTable(
                name: "customers",
                schema: "public");

            migrationBuilder.DropTable(
                name: "sales_channels",
                schema: "public");
        }
    }
}
