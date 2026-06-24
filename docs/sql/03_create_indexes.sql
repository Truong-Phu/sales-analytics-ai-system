
CREATE UNIQUE INDEX "IX_payment_method_configs_payment_method" ON public.payment_method_configs USING btree (payment_method);

CREATE INDEX "IX_payment_transactions_created_by" ON public.payment_transactions USING btree (created_by);

CREATE INDEX "IX_payment_transactions_invoice_id" ON public.payment_transactions USING btree (invoice_id);

CREATE INDEX "IX_payment_transactions_order_id" ON public.payment_transactions USING btree (order_id);

CREATE INDEX "IX_payment_transactions_payment_code" ON public.payment_transactions USING btree (payment_code);

CREATE INDEX "IX_payment_transactions_status_created_at" ON public.payment_transactions USING btree (status, created_at);

CREATE INDEX "IX_payment_transactions_tenant_id" ON public.payment_transactions USING btree (tenant_id);

CREATE INDEX "IX_payment_webhook_logs_provider_created_at" ON public.payment_webhook_logs USING btree (provider, created_at);

CREATE INDEX "IX_product_variations_company_id_sku" ON public.product_variations USING btree (company_id, sku);

CREATE UNIQUE INDEX "IX_product_variations_product_id_sku" ON public.product_variations USING btree (product_id, sku);

CREATE INDEX "IX_sales_data_channel_id_sale_date" ON public.sales_data USING btree (channel_id, sale_date);

CREATE INDEX "IX_sales_data_order_id" ON public.sales_data USING btree (order_id);

CREATE INDEX "IX_sales_data_sale_date" ON public.sales_data USING btree (sale_date);

CREATE INDEX idx_ad_spend_company ON public.ad_spend_monthly USING btree (company_id, year, month);

CREATE INDEX idx_anomaly_channel_date ON public.anomaly_alerts USING btree (channel_id, alert_date DESC);

CREATE INDEX idx_anomaly_unacked ON public.anomaly_alerts USING btree (is_acknowledged, severity, created_at DESC) WHERE (is_acknowledged = false);

CREATE INDEX idx_audit_logs_action_created ON public.audit_logs USING btree (action, created_at DESC);

CREATE INDEX idx_audit_logs_company ON public.audit_logs USING btree (company_id) WHERE (company_id IS NOT NULL);

CREATE INDEX idx_audit_logs_created ON public.audit_logs USING btree (created_at DESC);

CREATE INDEX idx_audit_logs_user_created ON public.audit_logs USING btree (user_id, created_at DESC);

CREATE INDEX idx_categories_company ON public.categories USING btree (company_id);

CREATE INDEX idx_categories_parent ON public.categories USING btree (parent_id);

CREATE UNIQUE INDEX idx_categories_slug ON public.categories USING btree (slug) WHERE (slug IS NOT NULL);

CREATE INDEX idx_channels_type_active ON public.sales_channels USING btree (channel_type, is_active);

CREATE INDEX idx_chat_history_user_tab ON public.chat_history USING btree (user_id, company_id, tab, created_at DESC);

CREATE INDEX idx_companies_active ON public.companies USING btree (is_active) WHERE (is_active = true);

CREATE UNIQUE INDEX idx_companies_slug ON public.companies USING btree (slug);

CREATE INDEX idx_customers_code ON public.customers USING btree (customer_code);

CREATE INDEX idx_customers_company ON public.customers USING btree (company_id) WHERE (company_id IS NOT NULL);

CREATE INDEX idx_customers_name_trgm ON public.customers USING gin (full_name public.gin_trgm_ops);

CREATE INDEX idx_customers_phone ON public.customers USING btree (phone) WHERE (phone IS NOT NULL);

CREATE INDEX idx_customers_province ON public.customers USING btree (province, segment_label);

CREATE INDEX idx_email_verif_email ON public.email_verifications USING btree (email, purpose);

CREATE INDEX idx_etl_jobs_channel ON public.etl_jobs USING btree (channel_id);

CREATE INDEX idx_etl_jobs_company ON public.etl_jobs USING btree (company_id) WHERE (company_id IS NOT NULL);

CREATE INDEX idx_etl_jobs_status ON public.etl_jobs USING btree (status, last_run_at DESC);

CREATE INDEX idx_etl_logs_job ON public.etl_logs USING btree (job_id, created_at DESC);

CREATE INDEX idx_etl_logs_level ON public.etl_logs USING btree (level, created_at DESC) WHERE ((level)::text = ANY ((ARRAY['ERROR'::character varying, 'CRITICAL'::character varying])::text[]));

CREATE INDEX idx_expenses_company_date ON public.expenses USING btree (company_id, expense_date);

CREATE INDEX idx_expenses_type ON public.expenses USING btree (company_id, expense_type);

CREATE INDEX idx_external_source_date ON public.dim_external_source USING btree (collected_date DESC);

CREATE INDEX idx_external_source_keyword ON public.dim_external_source USING btree (keyword);

CREATE INDEX idx_external_source_score ON public.dim_external_source USING btree (relevance_score DESC);

CREATE INDEX idx_external_source_type ON public.dim_external_source USING btree (source_type);

CREATE INDEX idx_facebook_feedback_company ON public.facebook_feedback USING btree (company_id);

CREATE INDEX idx_facebook_feedback_scraped ON public.facebook_feedback USING btree (company_id, scraped_at DESC);

CREATE INDEX idx_facebook_feedback_sentiment ON public.facebook_feedback USING btree (company_id, sentiment);

CREATE INDEX idx_forecast_channel_date ON public.forecast_results USING btree (channel_id, forecast_date DESC);

CREATE INDEX idx_gr_company ON public.goods_receipts USING btree (company_id);

CREATE INDEX idx_gr_po ON public.goods_receipts USING btree (purchase_order_id);

CREATE INDEX idx_gri_gr ON public.goods_receipt_items USING btree (goods_receipt_id);

CREATE INDEX idx_gri_variation ON public.goods_receipt_items USING btree (variation_id);

CREATE INDEX idx_integrations_company ON public.integrations USING btree (company_id);

CREATE INDEX idx_integrations_platform ON public.integrations USING btree (company_id, platform);

CREATE INDEX idx_integrations_status ON public.integrations USING btree (company_id, status, platform) WHERE (is_active = true);

CREATE INDEX idx_inventory_tx_company ON public.inventory_transactions USING btree (company_id);

CREATE INDEX idx_inventory_tx_created ON public.inventory_transactions USING btree (created_at DESC);

CREATE INDEX idx_inventory_tx_product ON public.inventory_transactions USING btree (product_id);

CREATE INDEX idx_invoices_company ON public.invoices USING btree (company_id, created_at DESC);

CREATE INDEX idx_invoices_payment_status ON public.invoices USING btree (company_id, payment_status);

CREATE INDEX idx_login_history_logged_at ON public.login_history USING btree (logged_at);

CREATE INDEX idx_login_history_user_id ON public.login_history USING btree (user_id);

CREATE INDEX idx_loyalty_points_company ON public.loyalty_points USING btree (company_id);

CREATE INDEX idx_loyalty_points_customer ON public.loyalty_points USING btree (customer_id);

CREATE INDEX idx_notifications_company ON public.notifications USING btree (company_id, created_at DESC);

CREATE INDEX idx_notifications_user_read ON public.notifications USING btree (user_id, is_read, created_at DESC);

CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);

CREATE INDEX idx_order_items_product ON public.order_items USING btree (product_id);

CREATE INDEX idx_order_items_variation ON public.order_items USING btree (variation_id);

CREATE INDEX idx_order_notes_order_id ON public.order_notes USING btree (order_id);

CREATE INDEX idx_orders_channel ON public.orders USING btree (channel_id, order_date DESC);

CREATE INDEX idx_orders_company ON public.orders USING btree (company_id, order_date DESC) WHERE (company_id IS NOT NULL);

CREATE INDEX idx_orders_customer ON public.orders USING btree (customer_id, order_date DESC);

CREATE INDEX idx_orders_date ON public.orders USING btree (order_date DESC);

CREATE INDEX idx_orders_external ON public.orders USING btree (external_order_id) WHERE (external_order_id IS NOT NULL);

CREATE INDEX idx_orders_status ON public.orders USING btree (status, order_date DESC);

CREATE INDEX idx_payroll_company_period ON public.employee_payroll USING btree (company_id, year, month);

CREATE INDEX idx_payroll_user ON public.employee_payroll USING btree (user_id);

CREATE INDEX idx_po_company ON public.purchase_orders USING btree (company_id);

CREATE INDEX idx_po_status ON public.purchase_orders USING btree (status);

CREATE INDEX idx_po_supplier ON public.purchase_orders USING btree (supplier_id);

CREATE INDEX idx_poi_po ON public.purchase_order_items USING btree (purchase_order_id);

CREATE INDEX idx_poi_variation ON public.purchase_order_items USING btree (variation_id);

CREATE INDEX idx_products_category ON public.products USING btree (category_id, is_active);

CREATE INDEX idx_products_company ON public.products USING btree (company_id, is_active) WHERE (company_id IS NOT NULL);

CREATE INDEX idx_products_is_active ON public.products USING btree (is_active) WHERE (is_active = true);

CREATE INDEX idx_products_name_gin ON public.products USING gin (to_tsvector('simple'::regconfig, (product_name)::text));

CREATE INDEX idx_products_sku ON public.products USING btree (sku);

CREATE INDEX idx_push_tokens_user ON public.push_tokens USING btree (user_id, is_active);

CREATE INDEX idx_raw_facebook_comments_gin ON public.raw_facebook_data USING gin (comments);

CREATE INDEX idx_raw_facebook_hash ON public.raw_facebook_data USING btree (content_hash) WHERE (content_hash IS NOT NULL);

CREATE INDEX idx_raw_facebook_page ON public.raw_facebook_data USING btree (page_name);

CREATE INDEX idx_raw_facebook_processed ON public.raw_facebook_data USING btree (is_processed) WHERE (is_processed = false);

CREATE INDEX idx_raw_facebook_scraped_at ON public.raw_facebook_data USING btree (scraped_at DESC);

CREATE INDEX idx_raw_fb_company ON public.raw_facebook_data USING btree (company_id) WHERE (company_id IS NOT NULL);

CREATE INDEX idx_raw_google_data_company_id ON public.raw_google_data USING btree (company_id);

CREATE INDEX idx_raw_google_data_company_scraped ON public.raw_google_data USING btree (company_id, scraped_at DESC);

CREATE INDEX idx_raw_google_data_content_hash ON public.raw_google_data USING btree (content_hash) WHERE (content_hash IS NOT NULL);

CREATE INDEX idx_raw_google_data_scraped_at ON public.raw_google_data USING btree (scraped_at DESC);

CREATE INDEX idx_raw_google_expires ON public.raw_google_data USING btree (expires_at) WHERE (expires_at IS NOT NULL);

CREATE INDEX idx_raw_google_hash ON public.raw_google_data USING btree (content_hash) WHERE (content_hash IS NOT NULL);

CREATE INDEX idx_raw_google_keyword ON public.raw_google_data USING btree (keyword);

CREATE INDEX idx_raw_google_processed ON public.raw_google_data USING btree (is_processed) WHERE (is_processed = false);

CREATE INDEX idx_raw_google_scraped_at ON public.raw_google_data USING btree (scraped_at DESC);

CREATE INDEX idx_reports_company ON public.reports USING btree (company_id, created_at DESC) WHERE (company_id IS NOT NULL);

CREATE INDEX idx_reports_status ON public.reports USING btree (status, created_at DESC) WHERE ((status)::text = ANY ((ARRAY['PENDING'::character varying, 'GENERATING'::character varying])::text[]));

CREATE INDEX idx_reports_user ON public.reports USING btree (user_id, created_at DESC);

CREATE INDEX idx_sa_variation ON public.stock_adjustments USING btree (variation_id);

CREATE INDEX idx_sales_channels_company ON public.sales_channels USING btree (company_id) WHERE (company_id IS NOT NULL);

CREATE INDEX idx_sales_data_company ON public.sales_data USING btree (company_id) WHERE (company_id IS NOT NULL);

CREATE INDEX idx_scraper_keywords_active_company ON public.scraper_keywords USING btree (is_active, source_type, company_id);

CREATE INDEX idx_scraper_keywords_company_id ON public.scraper_keywords USING btree (company_id);

CREATE INDEX idx_scraper_keywords_source_active ON public.scraper_keywords USING btree (source_type, is_active) WHERE (is_active = true);

CREATE INDEX idx_spa_active ON public.system_payment_accounts USING btree (is_active);

CREATE INDEX idx_spa_method ON public.system_payment_accounts USING btree (method);

CREATE INDEX idx_stock_adjustments_company ON public.stock_adjustments USING btree (company_id);

CREATE INDEX idx_stock_adjustments_created ON public.stock_adjustments USING btree (created_at DESC);

CREATE INDEX idx_stock_adjustments_product ON public.stock_adjustments USING btree (product_id);

CREATE INDEX idx_subscriptions_company ON public.subscriptions USING btree (company_id);

CREATE INDEX idx_subscriptions_status ON public.subscriptions USING btree (company_id, status, expires_at);

CREATE INDEX idx_suppliers_company ON public.suppliers USING btree (company_id);

CREATE INDEX idx_suppliers_name ON public.suppliers USING btree (supplier_name);

CREATE INDEX idx_users_company ON public.users USING btree (company_id) WHERE (company_id IS NOT NULL);

CREATE INDEX idx_users_email ON public.users USING btree (email);

CREATE INDEX idx_users_is_active ON public.users USING btree (is_active) WHERE (is_active = true);

CREATE UNIQUE INDEX idx_users_username ON public.users USING btree (username) WHERE (username IS NOT NULL);

CREATE INDEX idx_vouchers_code ON public.vouchers USING btree (code);

CREATE INDEX idx_vouchers_company ON public.vouchers USING btree (company_id);

CREATE INDEX idx_vouchers_customer ON public.vouchers USING btree (customer_id);

CREATE UNIQUE INDEX uq_keyword_source_company ON public.scraper_keywords USING btree (keyword, source_type, company_id);

CREATE INDEX idx_staging_lazada_processed ON staging.lazada_orders_raw USING btree (is_processed, fetched_at) WHERE (is_processed = false);

CREATE INDEX idx_staging_shopee_processed ON staging.shopee_orders_raw USING btree (is_processed, fetched_at) WHERE (is_processed = false);

CREATE INDEX idx_stg_ghn_client_code ON staging.raw_ghn_tracking USING btree (client_order_code);

CREATE INDEX idx_stg_ghn_company ON staging.raw_ghn_tracking USING btree (company_id, processed);

CREATE INDEX idx_stg_lazada_company ON staging.raw_lazada_orders USING btree (company_id, processed);

CREATE INDEX idx_stg_shopee_company ON staging.raw_shopee_orders USING btree (company_id, processed);

CREATE INDEX idx_stg_tiktok_company ON staging.raw_tiktok_orders USING btree (company_id, processed);

CREATE INDEX idx_dimcustomer_nk ON dw.dim_customer USING btree (customer_id, is_current);

CREATE INDEX idx_dimcustomer_region ON dw.dim_customer USING btree (region, segment_label) WHERE (is_current = true);

CREATE INDEX idx_dimdate_is_weekend ON dw.dim_date USING btree (is_weekend, date_key);

CREATE INDEX idx_dimdate_year_month ON dw.dim_date USING btree (year, month_number, date_key);

CREATE INDEX idx_dimproduct_category ON dw.dim_product USING btree (category_name, is_current);

CREATE INDEX idx_dimproduct_nk ON dw.dim_product USING btree (product_id, is_current);

CREATE INDEX idx_fact_ad_company ON dw.fact_ad_performance USING btree (company_id, date_key) WHERE (company_id IS NOT NULL);

CREATE INDEX idx_fact_payment_company ON dw.fact_payment USING btree (company_id, date_key) WHERE (company_id IS NOT NULL);

CREATE INDEX idx_fact_sales_company ON dw.fact_sales USING btree (company_id, date_key) WHERE (company_id IS NOT NULL);

CREATE INDEX idx_fact_shipping_company ON dw.fact_shipping USING btree (company_id, date_key) WHERE (company_id IS NOT NULL);

CREATE INDEX idx_factad_channel_date ON dw.fact_ad_performance USING btree (channel_key, date_key);

CREATE INDEX idx_factpay_payment_date ON dw.fact_payment USING btree (payment_key, date_key);

CREATE INDEX idx_factsales_channel_date ON dw.fact_sales USING btree (channel_key, date_key);

CREATE INDEX idx_factsales_customer ON dw.fact_sales USING btree (customer_key);

CREATE INDEX idx_factsales_date ON dw.fact_sales USING btree (date_key);

CREATE INDEX idx_factsales_external_order ON dw.fact_sales USING btree (external_order_id) WHERE (external_order_id IS NOT NULL);

CREATE INDEX idx_factsales_product_date ON dw.fact_sales USING btree (product_key, date_key);

CREATE INDEX idx_factsales_region ON dw.fact_sales USING btree (region_key, date_key);

CREATE INDEX idx_factship_region_date ON dw.fact_shipping USING btree (region_key, date_key);
