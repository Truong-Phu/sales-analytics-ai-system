using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace SalesAnalytics.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddScraperKeywordCompanyId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "avatar_url",
                schema: "public",
                table: "users",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "birthdate",
                schema: "public",
                table: "users",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "company_id",
                schema: "public",
                table: "users",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_super_admin",
                schema: "public",
                table: "users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "lang_pref",
                schema: "public",
                table: "users",
                type: "character varying(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "vi");

            migrationBuilder.AddColumn<string>(
                name: "phone",
                schema: "public",
                table: "users",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "reset_token",
                schema: "public",
                table: "users",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "reset_token_expiry",
                schema: "public",
                table: "users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "timezone",
                schema: "public",
                table: "users",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "Asia/Ho_Chi_Minh");

            migrationBuilder.AddColumn<Guid>(
                name: "company_id",
                schema: "public",
                table: "products",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "company_id",
                schema: "public",
                table: "orders",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "company_id",
                schema: "public",
                table: "customers",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "company_id",
                schema: "public",
                table: "categories",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "slug",
                schema: "public",
                table: "categories",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "sort_order",
                schema: "public",
                table: "categories",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "audit_logs",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    user_id = table.Column<int>(type: "integer", nullable: true),
                    username = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    action = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    entity_type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    entity_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    old_value = table.Column<string>(type: "text", nullable: true),
                    new_value = table.Column<string>(type: "text", nullable: true),
                    ip_address = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    user_agent = table.Column<string>(type: "text", nullable: true),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "SUCCESS"),
                    error_message = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_audit_logs", x => x.id);
                    table.ForeignKey(
                        name: "FK_audit_logs_users_user_id",
                        column: x => x.user_id,
                        principalSchema: "public",
                        principalTable: "users",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "companies",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    slug = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    email = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    phone = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    logo_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    industry = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    business_scale = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    shop_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    address = table.Column<string>(type: "text", nullable: true),
                    timezone = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "Asia/Ho_Chi_Minh"),
                    lang_pref = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "vi"),
                    onboarding_completed = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    onboarding_step = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    is_active = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    lock_reason = table.Column<string>(type: "text", nullable: true),
                    locked_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_companies", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "email_verifications",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    email = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    otp_code = table.Column<string>(type: "character varying(6)", maxLength: 6, nullable: false),
                    otp_hash = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    purpose = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "register"),
                    is_used = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    attempts = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_email_verifications", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "login_history",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    user_id = table.Column<int>(type: "integer", nullable: false),
                    ip_address = table.Column<string>(type: "character varying(45)", maxLength: 45, nullable: true),
                    user_agent = table.Column<string>(type: "text", nullable: true),
                    logged_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "SUCCESS")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_login_history", x => x.id);
                    table.ForeignKey(
                        name: "FK_login_history_users_user_id",
                        column: x => x.user_id,
                        principalSchema: "public",
                        principalTable: "users",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "notification_preferences",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    user_id = table.Column<int>(type: "integer", nullable: false),
                    email_notify = table.Column<bool>(type: "boolean", nullable: false),
                    anomaly_alert = table.Column<bool>(type: "boolean", nullable: false),
                    daily_report = table.Column<bool>(type: "boolean", nullable: false),
                    weekly_report = table.Column<bool>(type: "boolean", nullable: false),
                    sync_error_notify = table.Column<bool>(type: "boolean", nullable: false),
                    subscription_notify = table.Column<bool>(type: "boolean", nullable: false),
                    push_notify = table.Column<bool>(type: "boolean", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_notification_preferences", x => x.id);
                    table.ForeignKey(
                        name: "FK_notification_preferences_users_user_id",
                        column: x => x.user_id,
                        principalSchema: "public",
                        principalTable: "users",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "notifications",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<int>(type: "integer", nullable: false),
                    company_id = table.Column<Guid>(type: "uuid", nullable: true),
                    type = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "info"),
                    category = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    body = table.Column<string>(type: "text", nullable: true),
                    data = table.Column<string>(type: "jsonb", nullable: true),
                    is_read = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    read_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    channels = table.Column<string[]>(type: "text[]", nullable: false),
                    sent_email = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    sent_push = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_notifications", x => x.id);
                    table.ForeignKey(
                        name: "FK_notifications_users_user_id",
                        column: x => x.user_id,
                        principalSchema: "public",
                        principalTable: "users",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "push_tokens",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<int>(type: "integer", nullable: false),
                    company_id = table.Column<Guid>(type: "uuid", nullable: true),
                    expo_token = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    device_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    platform = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    last_used_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_push_tokens", x => x.id);
                    table.ForeignKey(
                        name: "FK_push_tokens_users_user_id",
                        column: x => x.user_id,
                        principalSchema: "public",
                        principalTable: "users",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "scraper_keywords",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    keyword = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    source_type = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "google"),
                    is_active = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    last_used_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    use_count = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    created_by = table.Column<int>(type: "integer", nullable: true),
                    company_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_scraper_keywords", x => x.id);
                    table.ForeignKey(
                        name: "FK_scraper_keywords_users_created_by",
                        column: x => x.created_by,
                        principalSchema: "public",
                        principalTable: "users",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "system_payment_accounts",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    method = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    display_name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    is_default = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    config = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    config_masked = table.Column<JsonDocument>(type: "jsonb", nullable: false),
                    note = table.Column<string>(type: "text", nullable: true),
                    sort_order = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    created_by = table.Column<int>(type: "integer", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_system_payment_accounts", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "subscriptions",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    company_id = table.Column<Guid>(type: "uuid", nullable: false),
                    plan = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "free"),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "active"),
                    started_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    trial_ends_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    grace_ends_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    auto_renew = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    max_channels = table.Column<int>(type: "integer", nullable: false, defaultValue: 2),
                    max_users = table.Column<int>(type: "integer", nullable: false, defaultValue: 3),
                    ai_enabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    advanced_reports = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()"),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_subscriptions", x => x.id);
                    table.ForeignKey(
                        name: "FK_subscriptions_companies_company_id",
                        column: x => x.company_id,
                        principalSchema: "public",
                        principalTable: "companies",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "invoices",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    company_id = table.Column<Guid>(type: "uuid", nullable: false),
                    subscription_id = table.Column<Guid>(type: "uuid", nullable: true),
                    invoice_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    plan = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    amount = table.Column<decimal>(type: "numeric(15,2)", nullable: false),
                    currency = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "VND"),
                    payment_method = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    payment_status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "pending"),
                    payment_gateway_ref = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    billing_period_start = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    billing_period_end = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    paid_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    pdf_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    metadata = table.Column<string>(type: "jsonb", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_invoices", x => x.id);
                    table.ForeignKey(
                        name: "FK_invoices_companies_company_id",
                        column: x => x.company_id,
                        principalSchema: "public",
                        principalTable: "companies",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_invoices_subscriptions_subscription_id",
                        column: x => x.subscription_id,
                        principalSchema: "public",
                        principalTable: "subscriptions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_users_company_id",
                schema: "public",
                table: "users",
                column: "company_id");

            migrationBuilder.CreateIndex(
                name: "IX_categories_company_id",
                schema: "public",
                table: "categories",
                column: "company_id");

            migrationBuilder.CreateIndex(
                name: "IX_categories_slug",
                schema: "public",
                table: "categories",
                column: "slug",
                unique: true,
                filter: "slug IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_audit_logs_action_created_at",
                schema: "public",
                table: "audit_logs",
                columns: new[] { "action", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_audit_logs_created_at",
                schema: "public",
                table: "audit_logs",
                column: "created_at");

            migrationBuilder.CreateIndex(
                name: "IX_audit_logs_user_id_created_at",
                schema: "public",
                table: "audit_logs",
                columns: new[] { "user_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_companies_email",
                schema: "public",
                table: "companies",
                column: "email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_companies_slug",
                schema: "public",
                table: "companies",
                column: "slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_email_verifications_email_purpose",
                schema: "public",
                table: "email_verifications",
                columns: new[] { "email", "purpose" });

            migrationBuilder.CreateIndex(
                name: "IX_invoices_company_id",
                schema: "public",
                table: "invoices",
                column: "company_id");

            migrationBuilder.CreateIndex(
                name: "IX_invoices_invoice_code",
                schema: "public",
                table: "invoices",
                column: "invoice_code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_invoices_subscription_id",
                schema: "public",
                table: "invoices",
                column: "subscription_id");

            migrationBuilder.CreateIndex(
                name: "IX_login_history_logged_at",
                schema: "public",
                table: "login_history",
                column: "logged_at");

            migrationBuilder.CreateIndex(
                name: "IX_login_history_user_id",
                schema: "public",
                table: "login_history",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "IX_notification_preferences_user_id",
                schema: "public",
                table: "notification_preferences",
                column: "user_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_notifications_company_id_created_at",
                schema: "public",
                table: "notifications",
                columns: new[] { "company_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_notifications_user_id_is_read_created_at",
                schema: "public",
                table: "notifications",
                columns: new[] { "user_id", "is_read", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_push_tokens_user_id_expo_token",
                schema: "public",
                table: "push_tokens",
                columns: new[] { "user_id", "expo_token" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_push_tokens_user_id_is_active",
                schema: "public",
                table: "push_tokens",
                columns: new[] { "user_id", "is_active" });

            migrationBuilder.CreateIndex(
                name: "IX_scraper_keywords_created_by",
                schema: "public",
                table: "scraper_keywords",
                column: "created_by");

            migrationBuilder.CreateIndex(
                name: "IX_scraper_keywords_is_active_source_type_company_id",
                schema: "public",
                table: "scraper_keywords",
                columns: new[] { "is_active", "source_type", "company_id" });

            migrationBuilder.CreateIndex(
                name: "IX_scraper_keywords_keyword_source_type_company_id",
                schema: "public",
                table: "scraper_keywords",
                columns: new[] { "keyword", "source_type", "company_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_subscriptions_company_id",
                schema: "public",
                table: "subscriptions",
                column: "company_id");

            migrationBuilder.CreateIndex(
                name: "IX_system_payment_accounts_method",
                schema: "public",
                table: "system_payment_accounts",
                column: "method");

            migrationBuilder.AddForeignKey(
                name: "FK_users_companies_company_id",
                schema: "public",
                table: "users",
                column: "company_id",
                principalSchema: "public",
                principalTable: "companies",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_users_companies_company_id",
                schema: "public",
                table: "users");

            migrationBuilder.DropTable(
                name: "audit_logs",
                schema: "public");

            migrationBuilder.DropTable(
                name: "email_verifications",
                schema: "public");

            migrationBuilder.DropTable(
                name: "invoices",
                schema: "public");

            migrationBuilder.DropTable(
                name: "login_history",
                schema: "public");

            migrationBuilder.DropTable(
                name: "notification_preferences",
                schema: "public");

            migrationBuilder.DropTable(
                name: "notifications",
                schema: "public");

            migrationBuilder.DropTable(
                name: "push_tokens",
                schema: "public");

            migrationBuilder.DropTable(
                name: "scraper_keywords",
                schema: "public");

            migrationBuilder.DropTable(
                name: "system_payment_accounts",
                schema: "public");

            migrationBuilder.DropTable(
                name: "subscriptions",
                schema: "public");

            migrationBuilder.DropTable(
                name: "companies",
                schema: "public");

            migrationBuilder.DropIndex(
                name: "IX_users_company_id",
                schema: "public",
                table: "users");

            migrationBuilder.DropIndex(
                name: "IX_categories_company_id",
                schema: "public",
                table: "categories");

            migrationBuilder.DropIndex(
                name: "IX_categories_slug",
                schema: "public",
                table: "categories");

            migrationBuilder.DropColumn(
                name: "avatar_url",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "birthdate",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "company_id",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "is_super_admin",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "lang_pref",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "phone",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "reset_token",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "reset_token_expiry",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "timezone",
                schema: "public",
                table: "users");

            migrationBuilder.DropColumn(
                name: "company_id",
                schema: "public",
                table: "products");

            migrationBuilder.DropColumn(
                name: "company_id",
                schema: "public",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "company_id",
                schema: "public",
                table: "customers");

            migrationBuilder.DropColumn(
                name: "company_id",
                schema: "public",
                table: "categories");

            migrationBuilder.DropColumn(
                name: "slug",
                schema: "public",
                table: "categories");

            migrationBuilder.DropColumn(
                name: "sort_order",
                schema: "public",
                table: "categories");
        }
    }
}
