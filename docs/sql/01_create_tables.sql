CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

CREATE SCHEMA IF NOT EXISTS public;

CREATE SCHEMA IF NOT EXISTS staging;

CREATE FUNCTION public.fn_set_google_data_expiry() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.expires_at IS NULL THEN
        NEW.expires_at := NEW.scraped_at + INTERVAL '30 days';
    END IF;
    RETURN NEW;
END; $$;

CREATE FUNCTION public.fn_update_customer_stats() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'DELIVERED' THEN
        UPDATE public.customers
            total_spent  = total_spent  + NEW.net_amount,
            updated_at   = NOW()
        WHERE customer_id = NEW.customer_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION public.fn_update_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TABLE public."__EFMigrationsHistory" (
    "MigrationId" character varying(150) NOT NULL,
    "ProductVersion" character varying(32) NOT NULL
);

CREATE TABLE public.ad_spend_monthly (
    id integer NOT NULL,
    company_id uuid NOT NULL,
    channel_id integer NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    amount numeric(15,2) DEFAULT 0 NOT NULL,
    note text,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT ad_spend_monthly_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT ad_spend_monthly_month_check CHECK (((month >= 1) AND (month <= 12)))
);

CREATE SEQUENCE public.ad_spend_monthly_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.ad_spend_monthly_id_seq OWNED BY public.ad_spend_monthly.id;

CREATE TABLE public.anomaly_alerts (
    alert_id integer NOT NULL,
    channel_id integer NOT NULL,
    alert_date date NOT NULL,
    metric_name character varying(100) NOT NULL,
    actual_value numeric(15,2),
    expected_value numeric(15,2),
    deviation numeric(10,4),
    severity character varying(20) NOT NULL,
    is_acknowledged boolean DEFAULT false NOT NULL,
    acknowledged_by integer,
    acknowledged_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid,
    CONSTRAINT chk_alert_severity CHECK (((severity)::text = ANY ((ARRAY['LOW'::character varying, 'MEDIUM'::character varying, 'HIGH'::character varying, 'CRITICAL'::character varying])::text[])))
);

CREATE SEQUENCE public.anomaly_alerts_alert_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.anomaly_alerts_alert_id_seq OWNED BY public.anomaly_alerts.alert_id;

CREATE TABLE public.audit_logs (
    id bigint NOT NULL,
    user_id integer,
    username character varying(255),
    action character varying(100) NOT NULL,
    entity_type character varying(100),
    entity_id character varying(100),
    old_value text,
    new_value text,
    ip_address character varying(50),
    user_agent text,
    status character varying(20) DEFAULT 'SUCCESS'::character varying NOT NULL,
    error_message text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    company_id uuid
);

CREATE SEQUENCE public.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;

CREATE TABLE public.categories (
    category_id integer NOT NULL,
    category_name character varying(255) NOT NULL,
    parent_id integer,
    level smallint DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    description text,
    slug character varying(200),
    company_id uuid,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT chk_categories_level CHECK (((level >= 1) AND (level <= 5)))
);

CREATE SEQUENCE public.categories_category_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.categories_category_id_seq OWNED BY public.categories.category_id;

CREATE TABLE public.channel_fee_configs (
    fee_config_id bigint NOT NULL,
    company_id uuid NOT NULL,
    channel_name character varying(50) NOT NULL,
    platform_fee_rate numeric(6,4) DEFAULT 0 NOT NULL,
    payment_fee_rate numeric(6,4) DEFAULT 0 NOT NULL,
    fixed_fee_per_order numeric(15,2) DEFAULT 0 NOT NULL,
    packaging_cost_per_order numeric(15,2) DEFAULT 0 NOT NULL,
    shipping_cost_mode character varying(30) DEFAULT 'USE_ORDER_SHIPPING_FEE'::character varying NOT NULL,
    is_estimated boolean DEFAULT true NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);

CREATE SEQUENCE public.channel_fee_configs_fee_config_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.channel_fee_configs_fee_config_id_seq OWNED BY public.channel_fee_configs.fee_config_id;

CREATE TABLE public.chat_history (
    id bigint NOT NULL,
    user_id integer NOT NULL,
    company_id uuid,
    tab character varying(30) DEFAULT 'business'::character varying NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    intent character varying(50),
    model_used character varying(60),
    fallback_used boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.chat_history ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.chat_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(200) NOT NULL,
    slug character varying(100) NOT NULL,
    logo_url character varying(500),
    phone character varying(20),
    email character varying(150) NOT NULL,
    industry character varying(100),
    business_scale character varying(50),
    shop_name character varying(200),
    address text,
    timezone character varying(50) DEFAULT 'Asia/Ho_Chi_Minh'::character varying NOT NULL,
    lang_pref character varying(10) DEFAULT 'vi'::character varying NOT NULL,
    onboarding_completed boolean DEFAULT false NOT NULL,
    onboarding_step integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    lock_reason text,
    locked_at timestamp with time zone,
    CONSTRAINT chk_companies_lang CHECK (((lang_pref)::text = ANY ((ARRAY['vi'::character varying, 'en'::character varying])::text[]))),
    CONSTRAINT chk_companies_scale CHECK ((((business_scale)::text = ANY ((ARRAY['under_500m'::character varying, '500m_2b'::character varying, 'over_2b'::character varying])::text[])) OR (business_scale IS NULL)))
);

CREATE TABLE public.customers (
    customer_id integer NOT NULL,
    customer_code character varying(50),
    full_name character varying(255) NOT NULL,
    email character varying(255),
    address text,
    province character varying(100),
    district character varying(100),
    total_orders integer DEFAULT 0 NOT NULL,
    total_spent numeric(15,2) DEFAULT 0 NOT NULL,
    segment_label character varying(50),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid,
    avg_order_value numeric(15,2),
    birthday date,
    first_name character varying(100),
    first_order_at timestamp with time zone,
    full_address text,
    last_name character varying(100),
    last_order_at timestamp with time zone,
    lazada_customer_id character varying(50),
    loyalty_points integer DEFAULT 0,
    loyalty_tier character varying(30),
    primary_channel character varying(50),
    rfm_f_score integer,
    rfm_m_score integer,
    rfm_r_score integer,
    rfm_score integer,
    rfm_segment character varying(50),
    rfm_updated_at timestamp with time zone,
    shopee_buyer_id bigint,
    tiktok_user_id character varying(50),
    username character varying(255),
    ward character varying(100),
    phone character varying(30),
    CONSTRAINT chk_customers_segment CHECK ((((segment_label)::text = ANY ((ARRAY['VIP'::character varying, 'REGULAR'::character varying, 'NEW'::character varying, 'INACTIVE'::character varying])::text[])) OR (segment_label IS NULL))),
    CONSTRAINT chk_customers_total_orders CHECK ((total_orders >= 0)),
    CONSTRAINT chk_customers_total_spent CHECK ((total_spent >= (0)::numeric))
);

CREATE SEQUENCE public.customers_customer_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.customers_customer_id_seq OWNED BY public.customers.customer_id;

CREATE TABLE public.dim_external_source (
    source_id integer NOT NULL,
    source_type character varying(50) NOT NULL,
    keyword text,
    title text,
    content text,
    url text,
    relevance_score integer DEFAULT 0,
    collected_date date NOT NULL,
    content_hash text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.dim_external_source_source_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.dim_external_source_source_id_seq OWNED BY public.dim_external_source.source_id;

CREATE TABLE public.email_verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(150) NOT NULL,
    otp_code character varying(6) NOT NULL,
    otp_hash character varying(200) NOT NULL,
    purpose character varying(50) DEFAULT 'register'::character varying NOT NULL,
    is_used boolean DEFAULT false NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_otp_purpose CHECK (((purpose)::text = ANY ((ARRAY['register'::character varying, 'forgot_password'::character varying])::text[])))
);

CREATE TABLE public.employee_payroll (
    payroll_id bigint NOT NULL,
    company_id uuid NOT NULL,
    user_id integer NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    base_salary numeric(15,2) DEFAULT 0 NOT NULL,
    bonus_amount numeric(15,2) DEFAULT 0 NOT NULL,
    penalty_amount numeric(15,2) DEFAULT 0 NOT NULL,
    note text,
    status character varying(20) DEFAULT 'Draft'::character varying NOT NULL,
    approved_by integer,
    approved_at timestamp with time zone,
    paid_at timestamp with time zone,
    email_sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT employee_payroll_base_salary_check CHECK ((base_salary >= (0)::numeric)),
    CONSTRAINT employee_payroll_bonus_amount_check CHECK ((bonus_amount >= (0)::numeric)),
    CONSTRAINT employee_payroll_month_check CHECK (((month >= 1) AND (month <= 12))),
    CONSTRAINT employee_payroll_penalty_amount_check CHECK ((penalty_amount >= (0)::numeric)),
    CONSTRAINT employee_payroll_status_check CHECK (((status)::text = ANY ((ARRAY['Draft'::character varying, 'Active'::character varying, 'Completed'::character varying, 'Approved'::character varying, 'Paid'::character varying])::text[])))
);

CREATE SEQUENCE public.employee_payroll_payroll_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.employee_payroll_payroll_id_seq OWNED BY public.employee_payroll.payroll_id;

CREATE TABLE public.etl_jobs (
    job_id integer NOT NULL,
    job_name character varying(255) NOT NULL,
    channel_id integer,
    status character varying(50) DEFAULT 'IDLE'::character varying NOT NULL,
    schedule_cron character varying(100),
    last_run_at timestamp with time zone,
    records_processed integer DEFAULT 0 NOT NULL,
    records_failed integer DEFAULT 0 NOT NULL,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid,
    CONSTRAINT chk_etljob_status CHECK (((status)::text = ANY ((ARRAY['IDLE'::character varying, 'RUNNING'::character varying, 'SUCCESS'::character varying, 'FAILED'::character varying, 'PAUSED'::character varying])::text[])))
);

CREATE SEQUENCE public.etl_jobs_job_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.etl_jobs_job_id_seq OWNED BY public.etl_jobs.job_id;

CREATE TABLE public.etl_logs (
    log_id integer NOT NULL,
    job_id integer,
    phase character varying(100) NOT NULL,
    message text,
    level character varying(20) DEFAULT 'INFO'::character varying NOT NULL,
    records_count integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_etllog_level CHECK (((level)::text = ANY ((ARRAY['DEBUG'::character varying, 'INFO'::character varying, 'WARN'::character varying, 'ERROR'::character varying, 'CRITICAL'::character varying])::text[]))),
    CONSTRAINT chk_etllog_phase CHECK (((phase)::text = ANY ((ARRAY['EXTRACT'::character varying, 'TRANSFORM'::character varying, 'QUALITY_CHECK'::character varying, 'LOAD'::character varying, 'GENERAL'::character varying])::text[])))
);

CREATE SEQUENCE public.etl_logs_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.etl_logs_log_id_seq OWNED BY public.etl_logs.log_id;

CREATE TABLE public.etl_watermarks (
    watermark_id integer NOT NULL,
    source_table character varying(255) NOT NULL,
    channel_id integer,
    last_loaded_at timestamp with time zone,
    last_loaded_key character varying(255),
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.etl_watermarks_watermark_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.etl_watermarks_watermark_id_seq OWNED BY public.etl_watermarks.watermark_id;

CREATE TABLE public.expenses (
    expense_id bigint NOT NULL,
    company_id uuid NOT NULL,
    expense_type character varying(50) NOT NULL,
    amount numeric(15,2) NOT NULL,
    expense_date date NOT NULL,
    description text,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT expenses_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT expenses_expense_type_check CHECK (((expense_type)::text = ANY ((ARRAY['Salary'::character varying, 'Warehouse'::character varying, 'Utilities'::character varying, 'Internet'::character varying, 'Office'::character varying, 'Other'::character varying])::text[])))
);

CREATE SEQUENCE public.expenses_expense_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.expenses_expense_id_seq OWNED BY public.expenses.expense_id;

CREATE TABLE public.facebook_feedback (
    id integer NOT NULL,
    company_id uuid NOT NULL,
    post_id character varying(50),
    comment_id character varying(50),
    message text,
    author_name character varying(255),
    sentiment character varying(20),
    like_count integer DEFAULT 0,
    created_at timestamp with time zone,
    scraped_at timestamp with time zone DEFAULT now(),
    CONSTRAINT facebook_feedback_sentiment_check CHECK (((sentiment)::text = ANY ((ARRAY['positive'::character varying, 'negative'::character varying, 'neutral'::character varying])::text[])))
);

CREATE SEQUENCE public.facebook_feedback_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.facebook_feedback_id_seq OWNED BY public.facebook_feedback.id;

CREATE TABLE public.forecast_results (
    forecast_id integer NOT NULL,
    channel_id integer NOT NULL,
    forecast_date date NOT NULL,
    predicted_revenue numeric(15,2),
    lower_bound numeric(15,2),
    upper_bound numeric(15,2),
    trend numeric(15,2),
    seasonality numeric(10,4),
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid
);

CREATE SEQUENCE public.forecast_results_forecast_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.forecast_results_forecast_id_seq OWNED BY public.forecast_results.forecast_id;

CREATE TABLE public.goods_receipt_items (
    goods_receipt_item_id bigint NOT NULL,
    goods_receipt_id bigint NOT NULL,
    purchase_order_item_id bigint NOT NULL,
    product_id integer NOT NULL,
    received_quantity integer NOT NULL,
    import_price numeric(18,2) DEFAULT 0 NOT NULL,
    total_price numeric(18,2) DEFAULT 0 NOT NULL,
    variation_id integer,
    CONSTRAINT goods_receipt_items_received_quantity_check CHECK ((received_quantity > 0))
);

CREATE SEQUENCE public.goods_receipt_items_goods_receipt_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.goods_receipt_items_goods_receipt_item_id_seq OWNED BY public.goods_receipt_items.goods_receipt_item_id;

CREATE TABLE public.goods_receipts (
    goods_receipt_id bigint NOT NULL,
    company_id uuid NOT NULL,
    purchase_order_id bigint NOT NULL,
    receipt_code character varying(50) NOT NULL,
    total_quantity integer DEFAULT 0 NOT NULL,
    total_amount numeric(18,2) DEFAULT 0 NOT NULL,
    note text,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.goods_receipts_goods_receipt_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.goods_receipts_goods_receipt_id_seq OWNED BY public.goods_receipts.goods_receipt_id;

CREATE TABLE public.integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    platform character varying(50) NOT NULL,
    platform_type character varying(20) DEFAULT 'oauth'::character varying NOT NULL,
    account_id character varying(200),
    account_name character varying(200),
    access_token text,
    refresh_token text,
    token_expiry timestamp with time zone,
    additional_config jsonb,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    last_sync_at timestamp with time zone,
    last_error text,
    sync_frequency_minutes integer DEFAULT 60 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    connected_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_integrations_platform CHECK (((platform)::text = ANY ((ARRAY['shopee'::character varying, 'lazada'::character varying, 'tiktok'::character varying, 'facebook'::character varying, 'instagram'::character varying, 'zalo'::character varying, 'google'::character varying, 'facebook_ads'::character varying, 'google_ads'::character varying, 'tiktok_ads'::character varying, 'vnpay'::character varying, 'momo'::character varying, 'zalopay'::character varying, 'ghn'::character varying, 'ghtk'::character varying, 'jnt'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT chk_integrations_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'connected'::character varying, 'expired'::character varying, 'error'::character varying, 'disconnected'::character varying])::text[]))),
    CONSTRAINT chk_integrations_type CHECK (((platform_type)::text = ANY ((ARRAY['oauth'::character varying, 'scraper'::character varying, 'api_key'::character varying])::text[])))
);

CREATE TABLE public.inventory_transactions (
    transaction_id bigint NOT NULL,
    company_id uuid NOT NULL,
    product_id integer NOT NULL,
    transaction_type character varying(50) NOT NULL,
    quantity_change integer NOT NULL,
    before_stock integer NOT NULL,
    after_stock integer NOT NULL,
    reference_type character varying(50),
    reference_id bigint,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer
);

CREATE SEQUENCE public.inventory_transactions_transaction_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.inventory_transactions_transaction_id_seq OWNED BY public.inventory_transactions.transaction_id;

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    subscription_id uuid,
    invoice_code character varying(50) NOT NULL,
    plan character varying(20) NOT NULL,
    amount numeric(15,2) NOT NULL,
    currency character varying(10) DEFAULT 'VND'::character varying NOT NULL,
    payment_method character varying(50),
    payment_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    payment_gateway_ref character varying(200),
    billing_period_start timestamp with time zone,
    billing_period_end timestamp with time zone,
    paid_at timestamp with time zone,
    pdf_url character varying(500),
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_invoices_amount CHECK ((amount >= (0)::numeric)),
    CONSTRAINT chk_invoices_method CHECK ((((payment_method)::text = ANY ((ARRAY['vnpay'::character varying, 'momo'::character varying, 'bank_transfer'::character varying])::text[])) OR (payment_method IS NULL))),
    CONSTRAINT chk_invoices_status CHECK (((payment_status)::text = ANY ((ARRAY['pending'::character varying, 'paid'::character varying, 'failed'::character varying, 'refunded'::character varying])::text[])))
);

CREATE TABLE public.login_history (
    id integer NOT NULL,
    user_id integer NOT NULL,
    ip_address character varying(45),
    user_agent text,
    logged_at timestamp with time zone DEFAULT now() NOT NULL,
    status character varying(20) DEFAULT 'SUCCESS'::character varying NOT NULL,
    CONSTRAINT chk_login_status CHECK (((status)::text = ANY ((ARRAY['SUCCESS'::character varying, 'FAILED'::character varying])::text[])))
);

CREATE SEQUENCE public.login_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.login_history_id_seq OWNED BY public.login_history.id;

CREATE TABLE public.loyalty_config (
    id integer NOT NULL,
    company_id uuid NOT NULL,
    points_per_vnd integer DEFAULT 1000 NOT NULL,
    vnd_per_point integer DEFAULT 1000 NOT NULL,
    min_redeem_points integer DEFAULT 100 NOT NULL,
    point_expiry_days integer DEFAULT 365 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.loyalty_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.loyalty_config_id_seq OWNED BY public.loyalty_config.id;

CREATE TABLE public.loyalty_points (
    id integer NOT NULL,
    company_id uuid NOT NULL,
    customer_id integer NOT NULL,
    order_id integer,
    points integer NOT NULL,
    point_type character varying(20) NOT NULL,
    description text,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer,
    CONSTRAINT loyalty_points_point_type_check CHECK (((point_type)::text = ANY ((ARRAY['EARNED'::character varying, 'REDEEMED'::character varying, 'EXPIRED'::character varying, 'BONUS'::character varying])::text[])))
);

CREATE SEQUENCE public.loyalty_points_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.loyalty_points_id_seq OWNED BY public.loyalty_points.id;

CREATE TABLE public.notification_preferences (
    id integer NOT NULL,
    user_id integer NOT NULL,
    email_notify boolean DEFAULT true NOT NULL,
    anomaly_alert boolean DEFAULT true NOT NULL,
    daily_report boolean DEFAULT false NOT NULL,
    weekly_report boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sync_error_notify boolean DEFAULT true NOT NULL,
    subscription_notify boolean DEFAULT true NOT NULL,
    push_notify boolean DEFAULT false NOT NULL,
    low_stock_alert boolean DEFAULT true NOT NULL,
    ai_recommend_alert boolean DEFAULT false NOT NULL,
    new_order_notify boolean DEFAULT true NOT NULL
);

CREATE SEQUENCE public.notification_preferences_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.notification_preferences_id_seq OWNED BY public.notification_preferences.id;

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    company_id uuid,
    type character varying(50) DEFAULT 'info'::character varying NOT NULL,
    category character varying(50),
    title character varying(200) NOT NULL,
    body text,
    data jsonb,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp with time zone,
    channels text[] DEFAULT '{in_app}'::text[] NOT NULL,
    sent_email boolean DEFAULT false NOT NULL,
    sent_push boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_notif_category CHECK (((category IS NULL) OR ((category)::text = ANY (ARRAY['sync'::text, 'subscription'::text, 'anomaly'::text, 'system'::text, 'auth'::text, 'inventory'::text])))),
    CONSTRAINT chk_notif_type CHECK (((type)::text = ANY ((ARRAY['info'::character varying, 'warning'::character varying, 'error'::character varying, 'success'::character varying])::text[])))
);

CREATE TABLE public.order_items (
    item_id integer NOT NULL,
    order_id integer NOT NULL,
    product_id integer NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(15,2) NOT NULL,
    discount numeric(15,2) DEFAULT 0 NOT NULL,
    subtotal numeric(15,2) NOT NULL,
    platform_item_id character varying(100),
    platform_order_item_id character varying(100),
    model_id character varying(100),
    sku_id character varying(100),
    product_name text,
    sku character varying(100),
    variation_name character varying(255),
    original_price numeric(15,2),
    sale_price numeric(15,2),
    platform_discount numeric(15,2) DEFAULT 0 NOT NULL,
    seller_discount numeric(15,2) DEFAULT 0 NOT NULL,
    weight numeric(10,3),
    image_url text,
    package_id character varying(100),
    tracking_number character varying(100),
    package_status character varying(50),
    promotion_type character varying(100),
    promotion_id character varying(100),
    currency character varying(10) DEFAULT 'VND'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    variation_id integer,
    CONSTRAINT chk_items_discount CHECK ((discount >= (0)::numeric)),
    CONSTRAINT chk_items_price CHECK ((unit_price >= (0)::numeric)),
    CONSTRAINT chk_items_qty CHECK ((quantity > 0)),
    CONSTRAINT chk_items_subtotal CHECK ((subtotal >= (0)::numeric))
);

CREATE SEQUENCE public.order_items_item_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.order_items_item_id_seq OWNED BY public.order_items.item_id;

CREATE TABLE public.order_notes (
    id integer NOT NULL,
    order_id integer NOT NULL,
    user_id integer,
    user_name character varying(255),
    note text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.order_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.order_notes_id_seq OWNED BY public.order_notes.id;

CREATE TABLE public.orders (
    order_id integer NOT NULL,
    order_code character varying(100) NOT NULL,
    customer_id integer NOT NULL,
    channel_id integer NOT NULL,
    status character varying(50) DEFAULT 'PENDING'::character varying NOT NULL,
    total_amount numeric(15,2) NOT NULL,
    discount_amount numeric(15,2) DEFAULT 0 NOT NULL,
    shipping_fee numeric(15,2) DEFAULT 0 NOT NULL,
    net_amount numeric(15,2) GENERATED ALWAYS AS ((total_amount - discount_amount)) STORED,
    payment_method character varying(50),
    payment_status character varying(50) DEFAULT 'UNPAID'::character varying NOT NULL,
    shipping_status character varying(50) DEFAULT 'NOT_SHIPPED'::character varying NOT NULL,
    order_date timestamp with time zone NOT NULL,
    delivered_at timestamp with time zone,
    external_order_id character varying(200),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid,
    created_by_user_id integer,
    pos_note text,
    buyer_username character varying(255),
    cancel_by character varying(50),
    cancel_reason text,
    channel_type character varying(20) DEFAULT 'online'::character varying,
    currency character varying(10) DEFAULT 'VND'::character varying,
    customer_email character varying(255),
    customer_name character varying(255),
    customer_phone character varying(30),
    days_to_ship integer,
    expected_delivery_at timestamp with time zone,
    fulfillment_type character varying(50),
    ghn_order_code character varying(50),
    is_cod boolean DEFAULT false,
    logistics_status character varying(50),
    note text,
    original_shipping_fee numeric(15,2),
    original_total numeric(15,2),
    paid_at timestamp with time zone,
    platform_created_at timestamp with time zone,
    platform_discount numeric(15,2) DEFAULT 0,
    platform_order_id character varying(100),
    platform_status character varying(50),
    platform_updated_at timestamp with time zone,
    seller_discount numeric(15,2) DEFAULT 0,
    ship_by_date timestamp with time zone,
    shipped_at timestamp with time zone,
    shipping_address text,
    shipping_carrier character varying(100),
    shipping_country character varying(10) DEFAULT 'VN'::character varying,
    shipping_district character varying(100),
    shipping_fee_platform_discount numeric(15,2) DEFAULT 0,
    shipping_fee_seller_discount numeric(15,2) DEFAULT 0,
    shipping_full_address text,
    shipping_name character varying(255),
    shipping_phone character varying(30),
    shipping_province character varying(100),
    shipping_ward character varying(100),
    shipping_zipcode character varying(20),
    subtotal numeric(15,2),
    tax_amount numeric(15,2) DEFAULT 0,
    tracking_number character varying(100),
    voucher_amount numeric(15,2) DEFAULT 0,
    voucher_code character varying(100),
    is_stock_deducted boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_orders_discount CHECK ((discount_amount >= (0)::numeric)),
    CONSTRAINT chk_orders_pay_stat CHECK (((payment_status)::text = ANY ((ARRAY['UNPAID'::character varying, 'PAID'::character varying, 'REFUNDED'::character varying])::text[]))),
    CONSTRAINT chk_orders_ship_fee CHECK ((shipping_fee >= (0)::numeric)),
    CONSTRAINT chk_orders_ship_stat CHECK (((shipping_status)::text = ANY ((ARRAY['NOT_SHIPPED'::character varying, 'IN_TRANSIT'::character varying, 'DELIVERED'::character varying, 'FAILED'::character varying])::text[]))),
    CONSTRAINT chk_orders_status CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'CONFIRMED'::character varying, 'SHIPPING'::character varying, 'DELIVERED'::character varying, 'CANCELLED'::character varying, 'RETURNED'::character varying])::text[]))),
    CONSTRAINT chk_orders_total CHECK ((total_amount >= (0)::numeric))
);

CREATE SEQUENCE public.orders_order_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.orders_order_id_seq OWNED BY public.orders.order_id;

CREATE TABLE public.payment_method_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_method character varying(50) NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    config_json jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.payment_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id integer,
    invoice_id uuid,
    tenant_id uuid NOT NULL,
    payment_code character varying(100) NOT NULL,
    payment_method character varying(30) NOT NULL,
    amount numeric(15,2) NOT NULL,
    currency character varying(10) DEFAULT 'VND'::character varying NOT NULL,
    status character varying(20) DEFAULT 'Pending'::character varying NOT NULL,
    transaction_code character varying(200),
    gateway_response jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_at timestamp with time zone,
    expired_at timestamp with time zone,
    created_by integer
);

CREATE TABLE public.payment_webhook_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider character varying(50) NOT NULL,
    payload jsonb NOT NULL,
    signature character varying(500),
    processed_status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.product_channel_prices (
    id integer NOT NULL,
    product_id integer NOT NULL,
    channel character varying(100) NOT NULL,
    price numeric(18,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.product_channel_prices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.product_channel_prices_id_seq OWNED BY public.product_channel_prices.id;

CREATE TABLE public.product_variations (
    id integer NOT NULL,
    company_id uuid NOT NULL,
    product_id integer NOT NULL,
    shopee_model_id bigint,
    tiktok_sku_id character varying(50),
    lazada_sku_id bigint,
    sku character varying(100) NOT NULL,
    variation_name character varying(255),
    attribute_color character varying(100),
    attribute_size character varying(50),
    original_price numeric(15,2),
    sale_price numeric(15,2),
    currency character varying(10) DEFAULT 'VND'::character varying NOT NULL,
    stock_quantity integer DEFAULT 0 NOT NULL,
    warehouse_id character varying(100),
    image_url text,
    is_active boolean DEFAULT true NOT NULL,
    platform_status character varying(50),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cost_price numeric(15,2),
    lifecycle_status character varying(30) DEFAULT 'ACTIVE'::character varying NOT NULL,
    CONSTRAINT product_variations_lifecycle_status_check CHECK (((lifecycle_status)::text = ANY ((ARRAY['DRAFT'::character varying, 'ACTIVE'::character varying, 'DISCONTINUED'::character varying, 'SUSPENDED'::character varying])::text[])))
);

ALTER TABLE public.product_variations ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.product_variations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE public.products (
    product_id integer NOT NULL,
    sku character varying(100) NOT NULL,
    product_name character varying(500) NOT NULL,
    description text,
    base_price numeric(15,2) NOT NULL,
    cost_price numeric(15,2),
    stock_quantity integer DEFAULT 0 NOT NULL,
    category_id integer NOT NULL,
    image_url text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid,
    shopee_item_id bigint,
    tiktok_product_id character varying(50),
    lazada_item_id bigint,
    shopee_category_id integer,
    tiktok_category_id character varying(50),
    lazada_primary_category character varying(50),
    item_sku character varying(100),
    brand character varying(255),
    condition character varying(20) DEFAULT 'NEW'::character varying,
    weight numeric(10,2),
    package_length integer,
    package_width integer,
    package_height integer,
    original_price numeric(18,2),
    sale_price numeric(18,2),
    currency character varying(10) DEFAULT 'VND'::character varying,
    reserved_stock integer DEFAULT 0 NOT NULL,
    platform_status character varying(50),
    is_pre_order boolean DEFAULT false NOT NULL,
    days_to_ship integer DEFAULT 2 NOT NULL,
    image_url_list text,
    video_url text,
    has_model boolean DEFAULT false NOT NULL,
    platform_created_at timestamp with time zone,
    platform_updated_at timestamp with time zone,
    CONSTRAINT chk_products_base_price CHECK ((base_price >= (0)::numeric)),
    CONSTRAINT chk_products_cost_price CHECK (((cost_price >= (0)::numeric) OR (cost_price IS NULL))),
    CONSTRAINT chk_products_stock CHECK ((stock_quantity >= 0))
);

CREATE SEQUENCE public.products_product_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.products_product_id_seq OWNED BY public.products.product_id;

CREATE TABLE public.purchase_order_items (
    purchase_order_item_id bigint NOT NULL,
    purchase_order_id bigint NOT NULL,
    product_id integer NOT NULL,
    quantity integer NOT NULL,
    received_quantity integer DEFAULT 0 NOT NULL,
    import_price numeric(18,2) DEFAULT 0 NOT NULL,
    total_price numeric(18,2) DEFAULT 0 NOT NULL,
    variation_id integer,
    CONSTRAINT purchase_order_items_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT purchase_order_items_received_quantity_check CHECK ((received_quantity >= 0))
);

CREATE SEQUENCE public.purchase_order_items_purchase_order_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.purchase_order_items_purchase_order_item_id_seq OWNED BY public.purchase_order_items.purchase_order_item_id;

CREATE TABLE public.purchase_orders (
    purchase_order_id bigint NOT NULL,
    company_id uuid NOT NULL,
    supplier_id integer NOT NULL,
    purchase_code character varying(50) NOT NULL,
    status character varying(30) DEFAULT 'DRAFT'::character varying NOT NULL,
    total_amount numeric(18,2) DEFAULT 0 NOT NULL,
    note text,
    created_by integer,
    approved_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    approved_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    confirmation_token uuid,
    expected_delivery_date date
);

CREATE SEQUENCE public.purchase_orders_purchase_order_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.purchase_orders_purchase_order_id_seq OWNED BY public.purchase_orders.purchase_order_id;

CREATE TABLE public.push_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    company_id uuid,
    expo_token character varying(200) NOT NULL,
    device_name character varying(100),
    platform character varying(20),
    is_active boolean DEFAULT true NOT NULL,
    last_used_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_push_platform CHECK ((((platform)::text = ANY ((ARRAY['ios'::character varying, 'android'::character varying])::text[])) OR (platform IS NULL)))
);

CREATE TABLE public.raw_facebook_data (
    id integer NOT NULL,
    page_name text NOT NULL,
    post_id text,
    post_content text,
    comments jsonb,
    reactions_count integer DEFAULT 0 NOT NULL,
    post_date timestamp with time zone,
    scraped_at timestamp with time zone DEFAULT now() NOT NULL,
    is_processed boolean DEFAULT false NOT NULL,
    content_hash text,
    is_valid boolean DEFAULT true,
    normalized_at timestamp with time zone,
    hashtags text[],
    company_id uuid,
    CONSTRAINT chk_raw_fb_reactions CHECK ((reactions_count >= 0))
);

CREATE SEQUENCE public.raw_facebook_data_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.raw_facebook_data_id_seq OWNED BY public.raw_facebook_data.id;

CREATE TABLE public.raw_google_data (
    id integer NOT NULL,
    keyword text NOT NULL,
    title text,
    snippet text,
    url text,
    "position" integer,
    scraped_at timestamp with time zone DEFAULT now() NOT NULL,
    is_processed boolean DEFAULT false NOT NULL,
    content_hash text,
    is_valid boolean DEFAULT true,
    normalized_at timestamp with time zone,
    relevance_score integer DEFAULT 0,
    company_id uuid,
    product_name text,
    category text,
    price bigint,
    sales_count integer,
    trend_description text,
    source_domain character varying(255),
    keyword_id integer,
    expires_at timestamp with time zone,
    CONSTRAINT chk_raw_google_position CHECK ((("position" IS NULL) OR ("position" > 0)))
);

CREATE SEQUENCE public.raw_google_data_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.raw_google_data_id_seq OWNED BY public.raw_google_data.id;

CREATE TABLE public.recommendations (
    recommendation_id integer NOT NULL,
    alert_id integer NOT NULL,
    category character varying(100),
    message text NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    is_actioned boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.recommendations_recommendation_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.recommendations_recommendation_id_seq OWNED BY public.recommendations.recommendation_id;

CREATE TABLE public.reports (
    report_id integer NOT NULL,
    user_id integer NOT NULL,
    title character varying(500),
    file_path text,
    file_size_bytes integer,
    filter_json jsonb,
    status character varying(50) DEFAULT 'PENDING'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid,
    CONSTRAINT chk_reports_status CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'GENERATING'::character varying, 'READY'::character varying, 'FAILED'::character varying])::text[])))
);

CREATE SEQUENCE public.reports_report_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.reports_report_id_seq OWNED BY public.reports.report_id;

CREATE TABLE public.sales_channels (
    channel_id integer NOT NULL,
    channel_name character varying(255) NOT NULL,
    channel_type character varying(50) NOT NULL,
    api_key text,
    access_token text,
    refresh_token_api text,
    shop_id character varying(100),
    is_active boolean DEFAULT true NOT NULL,
    last_sync_at timestamp with time zone,
    sync_status character varying(50) DEFAULT 'IDLE'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid,
    CONSTRAINT chk_channels_status CHECK (((sync_status)::text = ANY ((ARRAY['IDLE'::character varying, 'RUNNING'::character varying, 'SUCCESS'::character varying, 'FAILED'::character varying])::text[]))),
    CONSTRAINT chk_channels_type CHECK (((channel_type)::text = ANY ((ARRAY['SHOPEE'::character varying, 'LAZADA'::character varying, 'TIKTOK_SHOP'::character varying, 'FACEBOOK_SHOP'::character varying, 'GOOGLE_ADS'::character varying, 'WEBSITE'::character varying, 'OFFLINE'::character varying, 'OTHER'::character varying])::text[])))
);

CREATE SEQUENCE public.sales_channels_channel_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.sales_channels_channel_id_seq OWNED BY public.sales_channels.channel_id;

CREATE TABLE public.sales_data (
    sales_data_id integer NOT NULL,
    order_id integer,
    channel_id integer NOT NULL,
    revenue numeric NOT NULL,
    cost numeric DEFAULT 0 NOT NULL,
    profit numeric NOT NULL,
    sale_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid
);

ALTER TABLE public.sales_data ALTER COLUMN sales_data_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.sales_data_sales_data_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE public.scraper_keywords (
    id integer NOT NULL,
    keyword character varying(500) NOT NULL,
    source_type character varying(50) DEFAULT 'google'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    last_used_at timestamp without time zone,
    use_count integer DEFAULT 0 NOT NULL,
    created_by integer,
    company_id uuid,
    platform character varying(50)
);

CREATE SEQUENCE public.scraper_keywords_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.scraper_keywords_id_seq OWNED BY public.scraper_keywords.id;

CREATE TABLE public.staff_kpi_targets (
    id integer NOT NULL,
    company_id uuid NOT NULL,
    user_id integer NOT NULL,
    period_type character varying(20) NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    revenue_target numeric(15,2),
    order_count_target integer,
    new_customer_target integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT staff_kpi_targets_period_type_check CHECK (((period_type)::text = ANY ((ARRAY['MONTHLY'::character varying, 'QUARTERLY'::character varying])::text[])))
);

CREATE SEQUENCE public.staff_kpi_targets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.staff_kpi_targets_id_seq OWNED BY public.staff_kpi_targets.id;

CREATE TABLE public.stock_adjustments (
    stock_adjustment_id bigint NOT NULL,
    company_id uuid NOT NULL,
    product_id integer NOT NULL,
    old_quantity integer NOT NULL,
    new_quantity integer NOT NULL,
    difference integer NOT NULL,
    reason character varying(255) NOT NULL,
    note text,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    variation_id integer,
    CONSTRAINT stock_adjustments_new_quantity_check CHECK ((new_quantity >= 0))
);

CREATE SEQUENCE public.stock_adjustments_stock_adjustment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.stock_adjustments_stock_adjustment_id_seq OWNED BY public.stock_adjustments.stock_adjustment_id;

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    plan character varying(20) DEFAULT 'free'::character varying NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    trial_ends_at timestamp with time zone,
    grace_ends_at timestamp with time zone,
    auto_renew boolean DEFAULT true NOT NULL,
    max_channels integer DEFAULT 2 NOT NULL,
    max_users integer DEFAULT 3 NOT NULL,
    ai_enabled boolean DEFAULT false NOT NULL,
    advanced_reports boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_subs_plan CHECK (((plan)::text = ANY ((ARRAY['free'::character varying, 'pro'::character varying, 'enterprise'::character varying])::text[]))),
    CONSTRAINT chk_subs_status CHECK (((status)::text = ANY ((ARRAY['trial'::character varying, 'active'::character varying, 'expired'::character varying, 'cancelled'::character varying])::text[])))
);

CREATE TABLE public.supplier_products (
    supplier_id integer NOT NULL,
    product_id integer NOT NULL,
    import_price numeric(18,2) DEFAULT 0 NOT NULL
);

CREATE TABLE public.suppliers (
    supplier_id integer NOT NULL,
    company_id uuid NOT NULL,
    supplier_code character varying(50),
    supplier_name character varying(255) NOT NULL,
    contact_name character varying(255),
    phone character varying(30),
    email character varying(255),
    address text,
    tax_code character varying(50),
    note text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);

CREATE SEQUENCE public.suppliers_supplier_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.suppliers_supplier_id_seq OWNED BY public.suppliers.supplier_id;

CREATE TABLE public.system_payment_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    method character varying(50) NOT NULL,
    display_name character varying(200) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    config_masked jsonb DEFAULT '{}'::jsonb NOT NULL,
    note text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_payment_method CHECK (((method)::text = ANY ((ARRAY['vnpay'::character varying, 'momo'::character varying, 'bank_transfer'::character varying, 'zalopay'::character varying])::text[])))
);

CREATE TABLE public.users (
    user_id integer NOT NULL,
    email character varying(255) NOT NULL,
    password_hash text NOT NULL,
    full_name character varying(255),
    is_active boolean DEFAULT true NOT NULL,
    preferred_language character varying(10) DEFAULT 'vi'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    username character varying(50) NOT NULL,
    role character varying(20) DEFAULT 'Staff'::character varying NOT NULL,
    refresh_token text,
    refresh_token_expires_at timestamp with time zone,
    last_login_at timestamp with time zone,
    avatar_url character varying(500),
    phone character varying(20),
    birthdate date,
    timezone character varying(50) DEFAULT 'Asia/Ho_Chi_Minh'::character varying,
    lang_pref character varying(10) DEFAULT 'vi'::character varying,
    company_id uuid,
    is_super_admin boolean DEFAULT false NOT NULL,
    reset_token character varying(200),
    reset_token_expiry timestamp with time zone,
    CONSTRAINT chk_users_email CHECK (((email)::text ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'::text)),
    CONSTRAINT chk_users_language CHECK (((preferred_language)::text = ANY ((ARRAY['vi'::character varying, 'en'::character varying])::text[]))),
    CONSTRAINT chk_users_role CHECK (((role)::text = ANY ((ARRAY['Owner'::character varying, 'Manager'::character varying, 'Staff'::character varying, 'Staff_Sales'::character varying, 'Staff_Warehouse'::character varying, 'Staff_Marketing'::character varying, 'DataIT'::character varying, 'Admin'::character varying, 'Viewer'::character varying, 'SuperAdmin'::character varying])::text[])))
);

CREATE SEQUENCE public.users_user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.users_user_id_seq OWNED BY public.users.user_id;

CREATE TABLE public.vouchers (
    id integer NOT NULL,
    company_id uuid NOT NULL,
    code character varying(50) NOT NULL,
    type character varying(20) NOT NULL,
    value numeric(15,2) NOT NULL,
    min_order_value numeric(15,2) DEFAULT 0 NOT NULL,
    max_discount numeric(15,2),
    usage_limit integer,
    used_count integer DEFAULT 0 NOT NULL,
    customer_id integer,
    valid_from timestamp with time zone NOT NULL,
    valid_to timestamp with time zone NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_voucher_dates CHECK ((valid_to > valid_from)),
    CONSTRAINT vouchers_type_check CHECK (((type)::text = ANY ((ARRAY['PERCENT'::character varying, 'FIXED'::character varying, 'FREESHIP'::character varying])::text[]))),
    CONSTRAINT vouchers_value_check CHECK ((value > (0)::numeric))
);

CREATE SEQUENCE public.vouchers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.vouchers_id_seq OWNED BY public.vouchers.id;

CREATE TABLE staging.ad_performance_raw (
    id integer NOT NULL,
    channel_id integer NOT NULL,
    report_date date NOT NULL,
    raw_json jsonb NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    is_processed boolean DEFAULT false NOT NULL
);

CREATE SEQUENCE staging.ad_performance_raw_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE staging.ad_performance_raw_id_seq OWNED BY staging.ad_performance_raw.id;

CREATE TABLE staging.lazada_orders_raw (
    id integer NOT NULL,
    seller_id character varying(100) NOT NULL,
    order_id character varying(200) NOT NULL,
    raw_json jsonb NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    is_processed boolean DEFAULT false NOT NULL
);

CREATE SEQUENCE staging.lazada_orders_raw_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE staging.lazada_orders_raw_id_seq OWNED BY staging.lazada_orders_raw.id;

CREATE TABLE staging.raw_ghn_tracking (
    id integer NOT NULL,
    company_id uuid NOT NULL,
    order_code character varying(50),
    client_order_code character varying(100),
    raw_data jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now(),
    processed boolean DEFAULT false
);

CREATE SEQUENCE staging.raw_ghn_tracking_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE staging.raw_ghn_tracking_id_seq OWNED BY staging.raw_ghn_tracking.id;

CREATE TABLE staging.raw_lazada_orders (
    id integer NOT NULL,
    company_id uuid NOT NULL,
    order_id character varying(50),
    raw_order jsonb NOT NULL,
    raw_items jsonb,
    imported_at timestamp with time zone DEFAULT now(),
    processed boolean DEFAULT false,
    processed_at timestamp with time zone,
    error_message text
);

CREATE SEQUENCE staging.raw_lazada_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE staging.raw_lazada_orders_id_seq OWNED BY staging.raw_lazada_orders.id;

CREATE TABLE staging.raw_shopee_orders (
    id integer NOT NULL,
    company_id uuid NOT NULL,
    order_sn character varying(50),
    raw_data jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now(),
    processed boolean DEFAULT false,
    processed_at timestamp with time zone,
    error_message text
);

CREATE SEQUENCE staging.raw_shopee_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE staging.raw_shopee_orders_id_seq OWNED BY staging.raw_shopee_orders.id;

CREATE TABLE staging.raw_tiktok_orders (
    id integer NOT NULL,
    company_id uuid NOT NULL,
    order_id character varying(50),
    raw_data jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now(),
    processed boolean DEFAULT false,
    processed_at timestamp with time zone,
    error_message text
);

CREATE SEQUENCE staging.raw_tiktok_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE staging.raw_tiktok_orders_id_seq OWNED BY staging.raw_tiktok_orders.id;

CREATE TABLE staging.sales_raw (
    id integer NOT NULL,
    sale_date timestamp without time zone NOT NULL,
    channel_name character varying(100),
    product_sku character varying(100),
    quantity_sold integer DEFAULT 0 NOT NULL,
    net_revenue numeric(15,2) DEFAULT 0 NOT NULL,
    order_count integer DEFAULT 0 NOT NULL,
    imported_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE staging.sales_raw_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE staging.sales_raw_id_seq OWNED BY staging.sales_raw.id;

CREATE TABLE staging.shopee_orders_raw (
    id integer NOT NULL,
    shop_id character varying(100) NOT NULL,
    order_sn character varying(200) NOT NULL,
    raw_json jsonb NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    is_processed boolean DEFAULT false NOT NULL
);

CREATE SEQUENCE staging.shopee_orders_raw_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE staging.shopee_orders_raw_id_seq OWNED BY staging.shopee_orders_raw.id;

CREATE TABLE staging.tiktok_orders_raw (
    id integer NOT NULL,
    shop_id character varying(100) NOT NULL,
    order_id character varying(200) NOT NULL,
    raw_json jsonb NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    is_processed boolean DEFAULT false NOT NULL
);

CREATE SEQUENCE staging.tiktok_orders_raw_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE staging.tiktok_orders_raw_id_seq OWNED BY staging.tiktok_orders_raw.id;

ALTER TABLE ONLY public.ad_spend_monthly ALTER COLUMN id SET DEFAULT nextval('public.ad_spend_monthly_id_seq'::regclass);

ALTER TABLE ONLY public.anomaly_alerts ALTER COLUMN alert_id SET DEFAULT nextval('public.anomaly_alerts_alert_id_seq'::regclass);

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);

ALTER TABLE ONLY public.categories ALTER COLUMN category_id SET DEFAULT nextval('public.categories_category_id_seq'::regclass);

ALTER TABLE ONLY public.channel_fee_configs ALTER COLUMN fee_config_id SET DEFAULT nextval('public.channel_fee_configs_fee_config_id_seq'::regclass);

ALTER TABLE ONLY public.customers ALTER COLUMN customer_id SET DEFAULT nextval('public.customers_customer_id_seq'::regclass);

ALTER TABLE ONLY public.dim_external_source ALTER COLUMN source_id SET DEFAULT nextval('public.dim_external_source_source_id_seq'::regclass);

ALTER TABLE ONLY public.employee_payroll ALTER COLUMN payroll_id SET DEFAULT nextval('public.employee_payroll_payroll_id_seq'::regclass);

ALTER TABLE ONLY public.etl_jobs ALTER COLUMN job_id SET DEFAULT nextval('public.etl_jobs_job_id_seq'::regclass);

ALTER TABLE ONLY public.etl_logs ALTER COLUMN log_id SET DEFAULT nextval('public.etl_logs_log_id_seq'::regclass);

ALTER TABLE ONLY public.etl_watermarks ALTER COLUMN watermark_id SET DEFAULT nextval('public.etl_watermarks_watermark_id_seq'::regclass);

ALTER TABLE ONLY public.expenses ALTER COLUMN expense_id SET DEFAULT nextval('public.expenses_expense_id_seq'::regclass);

ALTER TABLE ONLY public.facebook_feedback ALTER COLUMN id SET DEFAULT nextval('public.facebook_feedback_id_seq'::regclass);

ALTER TABLE ONLY public.forecast_results ALTER COLUMN forecast_id SET DEFAULT nextval('public.forecast_results_forecast_id_seq'::regclass);

ALTER TABLE ONLY public.goods_receipt_items ALTER COLUMN goods_receipt_item_id SET DEFAULT nextval('public.goods_receipt_items_goods_receipt_item_id_seq'::regclass);

ALTER TABLE ONLY public.goods_receipts ALTER COLUMN goods_receipt_id SET DEFAULT nextval('public.goods_receipts_goods_receipt_id_seq'::regclass);

ALTER TABLE ONLY public.inventory_transactions ALTER COLUMN transaction_id SET DEFAULT nextval('public.inventory_transactions_transaction_id_seq'::regclass);

ALTER TABLE ONLY public.login_history ALTER COLUMN id SET DEFAULT nextval('public.login_history_id_seq'::regclass);

ALTER TABLE ONLY public.loyalty_config ALTER COLUMN id SET DEFAULT nextval('public.loyalty_config_id_seq'::regclass);

ALTER TABLE ONLY public.loyalty_points ALTER COLUMN id SET DEFAULT nextval('public.loyalty_points_id_seq'::regclass);

ALTER TABLE ONLY public.notification_preferences ALTER COLUMN id SET DEFAULT nextval('public.notification_preferences_id_seq'::regclass);

ALTER TABLE ONLY public.order_items ALTER COLUMN item_id SET DEFAULT nextval('public.order_items_item_id_seq'::regclass);

ALTER TABLE ONLY public.order_notes ALTER COLUMN id SET DEFAULT nextval('public.order_notes_id_seq'::regclass);

ALTER TABLE ONLY public.orders ALTER COLUMN order_id SET DEFAULT nextval('public.orders_order_id_seq'::regclass);

ALTER TABLE ONLY public.product_channel_prices ALTER COLUMN id SET DEFAULT nextval('public.product_channel_prices_id_seq'::regclass);

ALTER TABLE ONLY public.products ALTER COLUMN product_id SET DEFAULT nextval('public.products_product_id_seq'::regclass);

ALTER TABLE ONLY public.purchase_order_items ALTER COLUMN purchase_order_item_id SET DEFAULT nextval('public.purchase_order_items_purchase_order_item_id_seq'::regclass);

ALTER TABLE ONLY public.purchase_orders ALTER COLUMN purchase_order_id SET DEFAULT nextval('public.purchase_orders_purchase_order_id_seq'::regclass);

ALTER TABLE ONLY public.raw_facebook_data ALTER COLUMN id SET DEFAULT nextval('public.raw_facebook_data_id_seq'::regclass);

ALTER TABLE ONLY public.raw_google_data ALTER COLUMN id SET DEFAULT nextval('public.raw_google_data_id_seq'::regclass);

ALTER TABLE ONLY public.recommendations ALTER COLUMN recommendation_id SET DEFAULT nextval('public.recommendations_recommendation_id_seq'::regclass);

ALTER TABLE ONLY public.reports ALTER COLUMN report_id SET DEFAULT nextval('public.reports_report_id_seq'::regclass);

ALTER TABLE ONLY public.sales_channels ALTER COLUMN channel_id SET DEFAULT nextval('public.sales_channels_channel_id_seq'::regclass);

ALTER TABLE ONLY public.scraper_keywords ALTER COLUMN id SET DEFAULT nextval('public.scraper_keywords_id_seq'::regclass);

ALTER TABLE ONLY public.staff_kpi_targets ALTER COLUMN id SET DEFAULT nextval('public.staff_kpi_targets_id_seq'::regclass);

ALTER TABLE ONLY public.stock_adjustments ALTER COLUMN stock_adjustment_id SET DEFAULT nextval('public.stock_adjustments_stock_adjustment_id_seq'::regclass);

ALTER TABLE ONLY public.suppliers ALTER COLUMN supplier_id SET DEFAULT nextval('public.suppliers_supplier_id_seq'::regclass);

ALTER TABLE ONLY public.users ALTER COLUMN user_id SET DEFAULT nextval('public.users_user_id_seq'::regclass);

ALTER TABLE ONLY public.vouchers ALTER COLUMN id SET DEFAULT nextval('public.vouchers_id_seq'::regclass);

ALTER TABLE ONLY staging.ad_performance_raw ALTER COLUMN id SET DEFAULT nextval('staging.ad_performance_raw_id_seq'::regclass);

ALTER TABLE ONLY staging.lazada_orders_raw ALTER COLUMN id SET DEFAULT nextval('staging.lazada_orders_raw_id_seq'::regclass);

ALTER TABLE ONLY staging.raw_ghn_tracking ALTER COLUMN id SET DEFAULT nextval('staging.raw_ghn_tracking_id_seq'::regclass);

ALTER TABLE ONLY staging.raw_lazada_orders ALTER COLUMN id SET DEFAULT nextval('staging.raw_lazada_orders_id_seq'::regclass);

ALTER TABLE ONLY staging.raw_shopee_orders ALTER COLUMN id SET DEFAULT nextval('staging.raw_shopee_orders_id_seq'::regclass);

ALTER TABLE ONLY staging.raw_tiktok_orders ALTER COLUMN id SET DEFAULT nextval('staging.raw_tiktok_orders_id_seq'::regclass);

ALTER TABLE ONLY staging.sales_raw ALTER COLUMN id SET DEFAULT nextval('staging.sales_raw_id_seq'::regclass);

ALTER TABLE ONLY staging.shopee_orders_raw ALTER COLUMN id SET DEFAULT nextval('staging.shopee_orders_raw_id_seq'::regclass);

ALTER TABLE ONLY staging.tiktok_orders_raw ALTER COLUMN id SET DEFAULT nextval('staging.tiktok_orders_raw_id_seq'::regclass);

ALTER TABLE ONLY public."__EFMigrationsHistory"
    ADD CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId");

ALTER TABLE ONLY public.payment_method_configs
    ADD CONSTRAINT "PK_payment_method_configs" PRIMARY KEY (id);

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT "PK_payment_transactions" PRIMARY KEY (id);

ALTER TABLE ONLY public.payment_webhook_logs
    ADD CONSTRAINT "PK_payment_webhook_logs" PRIMARY KEY (id);

ALTER TABLE ONLY public.product_variations
    ADD CONSTRAINT "PK_product_variations" PRIMARY KEY (id);

ALTER TABLE ONLY public.sales_data
    ADD CONSTRAINT "PK_sales_data" PRIMARY KEY (sales_data_id);

ALTER TABLE ONLY public.ad_spend_monthly
    ADD CONSTRAINT ad_spend_monthly_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.anomaly_alerts
    ADD CONSTRAINT anomaly_alerts_pkey PRIMARY KEY (alert_id);

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (category_id);

ALTER TABLE ONLY public.channel_fee_configs
    ADD CONSTRAINT channel_fee_configs_pkey PRIMARY KEY (fee_config_id);

ALTER TABLE ONLY public.chat_history
    ADD CONSTRAINT chat_history_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_email_key UNIQUE (email);

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_slug_key UNIQUE (slug);

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_customer_code_key UNIQUE (customer_code);

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (customer_id);

ALTER TABLE ONLY public.dim_external_source
    ADD CONSTRAINT dim_external_source_content_hash_key UNIQUE (content_hash);

ALTER TABLE ONLY public.dim_external_source
    ADD CONSTRAINT dim_external_source_pkey PRIMARY KEY (source_id);

ALTER TABLE ONLY public.email_verifications
    ADD CONSTRAINT email_verifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.employee_payroll
    ADD CONSTRAINT employee_payroll_company_id_user_id_year_month_key UNIQUE (company_id, user_id, year, month);

ALTER TABLE ONLY public.employee_payroll
    ADD CONSTRAINT employee_payroll_pkey PRIMARY KEY (payroll_id);

ALTER TABLE ONLY public.etl_jobs
    ADD CONSTRAINT etl_jobs_pkey PRIMARY KEY (job_id);

ALTER TABLE ONLY public.etl_logs
    ADD CONSTRAINT etl_logs_pkey PRIMARY KEY (log_id);

ALTER TABLE ONLY public.etl_watermarks
    ADD CONSTRAINT etl_watermarks_pkey PRIMARY KEY (watermark_id);

ALTER TABLE ONLY public.etl_watermarks
    ADD CONSTRAINT etl_watermarks_source_table_channel_id_key UNIQUE (source_table, channel_id);

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (expense_id);

ALTER TABLE ONLY public.facebook_feedback
    ADD CONSTRAINT facebook_feedback_comment_id_key UNIQUE (comment_id);

ALTER TABLE ONLY public.facebook_feedback
    ADD CONSTRAINT facebook_feedback_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.forecast_results
    ADD CONSTRAINT forecast_results_channel_id_forecast_date_key UNIQUE (channel_id, forecast_date);

ALTER TABLE ONLY public.forecast_results
    ADD CONSTRAINT forecast_results_pkey PRIMARY KEY (forecast_id);

ALTER TABLE ONLY public.goods_receipt_items
    ADD CONSTRAINT goods_receipt_items_pkey PRIMARY KEY (goods_receipt_item_id);

ALTER TABLE ONLY public.goods_receipts
    ADD CONSTRAINT goods_receipts_pkey PRIMARY KEY (goods_receipt_id);

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_pkey PRIMARY KEY (transaction_id);

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_code_key UNIQUE (invoice_code);

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.login_history
    ADD CONSTRAINT login_history_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.loyalty_config
    ADD CONSTRAINT loyalty_config_company_id_key UNIQUE (company_id);

ALTER TABLE ONLY public.loyalty_config
    ADD CONSTRAINT loyalty_config_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.loyalty_points
    ADD CONSTRAINT loyalty_points_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_key UNIQUE (user_id);

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (item_id);

ALTER TABLE ONLY public.order_notes
    ADD CONSTRAINT order_notes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_external_order_id_key UNIQUE (external_order_id);

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_code_key UNIQUE (order_code);

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (order_id);

ALTER TABLE ONLY public.product_channel_prices
    ADD CONSTRAINT product_channel_prices_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.product_channel_prices
    ADD CONSTRAINT product_channel_prices_product_id_channel_key UNIQUE (product_id, channel);

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (product_id);

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_pkey PRIMARY KEY (purchase_order_item_id);

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_confirmation_token_key UNIQUE (confirmation_token);

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (purchase_order_id);

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_user_id_expo_token_key UNIQUE (user_id, expo_token);

ALTER TABLE ONLY public.raw_facebook_data
    ADD CONSTRAINT raw_facebook_data_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.raw_google_data
    ADD CONSTRAINT raw_google_data_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_pkey PRIMARY KEY (recommendation_id);

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (report_id);

ALTER TABLE ONLY public.sales_channels
    ADD CONSTRAINT sales_channels_pkey PRIMARY KEY (channel_id);

ALTER TABLE ONLY public.scraper_keywords
    ADD CONSTRAINT scraper_keywords_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.staff_kpi_targets
    ADD CONSTRAINT staff_kpi_targets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.staff_kpi_targets
    ADD CONSTRAINT staff_kpi_targets_user_id_period_start_period_type_key UNIQUE (user_id, period_start, period_type);

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_pkey PRIMARY KEY (stock_adjustment_id);

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.supplier_products
    ADD CONSTRAINT supplier_products_pkey PRIMARY KEY (supplier_id, product_id);

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (supplier_id);

ALTER TABLE ONLY public.system_payment_accounts
    ADD CONSTRAINT system_payment_accounts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ad_spend_monthly
    ADD CONSTRAINT uq_ad_spend_channel_month UNIQUE (company_id, channel_id, year, month);

ALTER TABLE ONLY public.channel_fee_configs
    ADD CONSTRAINT uq_fee_config_company_channel UNIQUE (company_id, channel_name);

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT uq_integration_company_platform_account UNIQUE (company_id, platform, account_id);

ALTER TABLE ONLY public.products
    ADD CONSTRAINT uq_products_sku_company UNIQUE (sku, company_id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_code_key UNIQUE (code);

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY staging.ad_performance_raw
    ADD CONSTRAINT ad_performance_raw_pkey PRIMARY KEY (id);

ALTER TABLE ONLY staging.lazada_orders_raw
    ADD CONSTRAINT lazada_orders_raw_order_id_key UNIQUE (order_id);

ALTER TABLE ONLY staging.lazada_orders_raw
    ADD CONSTRAINT lazada_orders_raw_pkey PRIMARY KEY (id);

ALTER TABLE ONLY staging.raw_ghn_tracking
    ADD CONSTRAINT raw_ghn_tracking_order_code_key UNIQUE (order_code);

ALTER TABLE ONLY staging.raw_ghn_tracking
    ADD CONSTRAINT raw_ghn_tracking_pkey PRIMARY KEY (id);

ALTER TABLE ONLY staging.raw_lazada_orders
    ADD CONSTRAINT raw_lazada_orders_order_id_key UNIQUE (order_id);

ALTER TABLE ONLY staging.raw_lazada_orders
    ADD CONSTRAINT raw_lazada_orders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY staging.raw_shopee_orders
    ADD CONSTRAINT raw_shopee_orders_order_sn_key UNIQUE (order_sn);

ALTER TABLE ONLY staging.raw_shopee_orders
    ADD CONSTRAINT raw_shopee_orders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY staging.raw_tiktok_orders
    ADD CONSTRAINT raw_tiktok_orders_order_id_key UNIQUE (order_id);

ALTER TABLE ONLY staging.raw_tiktok_orders
    ADD CONSTRAINT raw_tiktok_orders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY staging.sales_raw
    ADD CONSTRAINT sales_raw_pkey PRIMARY KEY (id);

ALTER TABLE ONLY staging.shopee_orders_raw
    ADD CONSTRAINT shopee_orders_raw_order_sn_key UNIQUE (order_sn);

ALTER TABLE ONLY staging.shopee_orders_raw
    ADD CONSTRAINT shopee_orders_raw_pkey PRIMARY KEY (id);

ALTER TABLE ONLY staging.tiktok_orders_raw
    ADD CONSTRAINT tiktok_orders_raw_order_id_key UNIQUE (order_id);

ALTER TABLE ONLY staging.tiktok_orders_raw
    ADD CONSTRAINT tiktok_orders_raw_pkey PRIMARY KEY (id);

ALTER TABLE ONLY staging.sales_raw
    ADD CONSTRAINT uq_sales_raw_date_channel_sku UNIQUE (sale_date, channel_name, product_sku);

CREATE TRIGGER trg_customer_stats AFTER INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.fn_update_customer_stats();

CREATE TRIGGER trg_google_data_expiry BEFORE INSERT ON public.raw_google_data FOR EACH ROW EXECUTE FUNCTION public.fn_set_google_data_expiry();

CREATE TRIGGER trg_update_companies BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

CREATE TRIGGER trg_update_customers BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

CREATE TRIGGER trg_update_integrations BEFORE UPDATE ON public.integrations FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

CREATE TRIGGER trg_update_orders BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

CREATE TRIGGER trg_update_products BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

CREATE TRIGGER trg_update_reports BEFORE UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

CREATE TRIGGER trg_update_sales_channels BEFORE UPDATE ON public.sales_channels FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

CREATE TRIGGER trg_update_subscriptions BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

CREATE TRIGGER trg_update_users BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.fn_update_timestamp();

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT "FK_payment_transactions_invoices_invoice_id" FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT "FK_payment_transactions_orders_order_id" FOREIGN KEY (order_id) REFERENCES public.orders(order_id) ON DELETE SET NULL;

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT "FK_payment_transactions_users_created_by" FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;

ALTER TABLE ONLY public.product_variations
    ADD CONSTRAINT "FK_product_variations_products_product_id" FOREIGN KEY (product_id) REFERENCES public.products(product_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.sales_data
    ADD CONSTRAINT "FK_sales_data_orders_order_id" FOREIGN KEY (order_id) REFERENCES public.orders(order_id) ON DELETE SET NULL;

ALTER TABLE ONLY public.sales_data
    ADD CONSTRAINT "FK_sales_data_sales_channels_channel_id" FOREIGN KEY (channel_id) REFERENCES public.sales_channels(channel_id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.ad_spend_monthly
    ADD CONSTRAINT ad_spend_monthly_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.sales_channels(channel_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ad_spend_monthly
    ADD CONSTRAINT ad_spend_monthly_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ad_spend_monthly
    ADD CONSTRAINT ad_spend_monthly_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;

ALTER TABLE ONLY public.anomaly_alerts
    ADD CONSTRAINT anomaly_alerts_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES public.users(user_id) ON DELETE SET NULL;

ALTER TABLE ONLY public.anomaly_alerts
    ADD CONSTRAINT anomaly_alerts_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.sales_channels(channel_id);

ALTER TABLE ONLY public.anomaly_alerts
    ADD CONSTRAINT anomaly_alerts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE SET NULL;

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.categories(category_id) ON DELETE SET NULL;

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.employee_payroll
    ADD CONSTRAINT employee_payroll_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(user_id) ON DELETE SET NULL;

ALTER TABLE ONLY public.employee_payroll
    ADD CONSTRAINT employee_payroll_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.employee_payroll
    ADD CONSTRAINT employee_payroll_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.etl_jobs
    ADD CONSTRAINT etl_jobs_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.sales_channels(channel_id) ON DELETE SET NULL;

ALTER TABLE ONLY public.etl_jobs
    ADD CONSTRAINT etl_jobs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;

ALTER TABLE ONLY public.facebook_feedback
    ADD CONSTRAINT facebook_feedback_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.forecast_results
    ADD CONSTRAINT forecast_results_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.sales_channels(channel_id);

ALTER TABLE ONLY public.forecast_results
    ADD CONSTRAINT forecast_results_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.goods_receipt_items
    ADD CONSTRAINT goods_receipt_items_goods_receipt_id_fkey FOREIGN KEY (goods_receipt_id) REFERENCES public.goods_receipts(goods_receipt_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.goods_receipt_items
    ADD CONSTRAINT goods_receipt_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id);

ALTER TABLE ONLY public.goods_receipt_items
    ADD CONSTRAINT goods_receipt_items_purchase_order_item_id_fkey FOREIGN KEY (purchase_order_item_id) REFERENCES public.purchase_order_items(purchase_order_item_id);

ALTER TABLE ONLY public.goods_receipt_items
    ADD CONSTRAINT goods_receipt_items_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.goods_receipts
    ADD CONSTRAINT goods_receipts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;

ALTER TABLE ONLY public.goods_receipts
    ADD CONSTRAINT goods_receipts_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(purchase_order_id);

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id);

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id);

ALTER TABLE ONLY public.login_history
    ADD CONSTRAINT login_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.loyalty_config
    ADD CONSTRAINT loyalty_config_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);

ALTER TABLE ONLY public.loyalty_points
    ADD CONSTRAINT loyalty_points_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);

ALTER TABLE ONLY public.loyalty_points
    ADD CONSTRAINT loyalty_points_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id);

ALTER TABLE ONLY public.loyalty_points
    ADD CONSTRAINT loyalty_points_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(customer_id);

ALTER TABLE ONLY public.loyalty_points
    ADD CONSTRAINT loyalty_points_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(order_id);

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(order_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id);

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.sales_channels(channel_id);

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(user_id);

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(customer_id);

ALTER TABLE ONLY public.product_channel_prices
    ADD CONSTRAINT product_channel_prices_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(category_id);

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id);

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(purchase_order_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(user_id) ON DELETE SET NULL;

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(supplier_id);

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.raw_facebook_data
    ADD CONSTRAINT raw_facebook_data_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.raw_google_data
    ADD CONSTRAINT raw_google_data_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.raw_google_data
    ADD CONSTRAINT raw_google_data_keyword_id_fkey FOREIGN KEY (keyword_id) REFERENCES public.scraper_keywords(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.recommendations
    ADD CONSTRAINT recommendations_alert_id_fkey FOREIGN KEY (alert_id) REFERENCES public.anomaly_alerts(alert_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id);

ALTER TABLE ONLY public.sales_channels
    ADD CONSTRAINT sales_channels_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.sales_data
    ADD CONSTRAINT sales_data_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.scraper_keywords
    ADD CONSTRAINT scraper_keywords_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;

ALTER TABLE ONLY public.staff_kpi_targets
    ADD CONSTRAINT staff_kpi_targets_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);

ALTER TABLE ONLY public.staff_kpi_targets
    ADD CONSTRAINT staff_kpi_targets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id);

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id);

ALTER TABLE ONLY public.stock_adjustments
    ADD CONSTRAINT stock_adjustments_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.supplier_products
    ADD CONSTRAINT supplier_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.supplier_products
    ADD CONSTRAINT supplier_products_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(supplier_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.system_payment_accounts
    ADD CONSTRAINT system_payment_accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id);

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(customer_id);