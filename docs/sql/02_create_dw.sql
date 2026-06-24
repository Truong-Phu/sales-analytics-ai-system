
CREATE SCHEMA IF NOT EXISTS dw;

CREATE FUNCTION dw.fn_populate_dim_date(p_start date DEFAULT '2020-01-01'::date, p_end date DEFAULT '2027-12-31'::date) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    d          DATE := p_start;
    rows_added INTEGER := 0;
    dow        SMALLINT;
    vn_holidays DATE[] := ARRAY[
        '2026-01-01','2026-01-26','2026-01-27','2026-01-28','2026-01-29','2026-01-30',
        '2026-04-30','2026-05-01','2026-09-02'
    ];
BEGIN
    WHILE d <= p_end LOOP
        dow := EXTRACT(ISODOW FROM d)::SMALLINT;
        INSERT INTO dw.dim_date (
            date_key, full_date, day_of_week, day_name, week_number,
            month_number, month_name, quarter, year, is_weekend, is_holiday, holiday_name
        )
        VALUES (
            TO_CHAR(d, 'YYYYMMDD')::INT,
            d,
            dow,
            CASE dow WHEN 1 THEN 'Thứ Hai' WHEN 2 THEN 'Thứ Ba'
                     WHEN 3 THEN 'Thứ Tư'  WHEN 4 THEN 'Thứ Năm'
                     WHEN 5 THEN 'Thứ Sáu' WHEN 6 THEN 'Thứ Bảy'
                     ELSE 'Chủ Nhật' END,
            EXTRACT(WEEK FROM d)::SMALLINT,
            EXTRACT(MONTH FROM d)::SMALLINT,
            'Tháng ' || EXTRACT(MONTH FROM d)::TEXT,
            EXTRACT(QUARTER FROM d)::SMALLINT,
            EXTRACT(YEAR FROM d)::SMALLINT,
            dow >= 6,
            d = ANY(vn_holidays),
            CASE
                WHEN d = ANY(vn_holidays) THEN
                    CASE
                        WHEN EXTRACT(MONTH FROM d)=1  AND EXTRACT(DAY FROM d)=1  THEN 'Tết Dương lịch'
                        WHEN EXTRACT(MONTH FROM d)=4  AND EXTRACT(DAY FROM d)=30 THEN 'Giải phóng miền Nam'
                        WHEN EXTRACT(MONTH FROM d)=5  AND EXTRACT(DAY FROM d)=1  THEN 'Quốc tế Lao động'
                        WHEN EXTRACT(MONTH FROM d)=9  AND EXTRACT(DAY FROM d)=2  THEN 'Quốc khánh'
                        ELSE 'Ngày lễ Tết Nguyên Đán'
                    END
                ELSE NULL
            END
        )
        ON CONFLICT (date_key) DO NOTHING;
        rows_added := rows_added + 1;
        d := d + INTERVAL '1 day';
    END LOOP;
    RETURN rows_added;
END;
$$;

CREATE TABLE dw.dim_channel (
    channel_key integer NOT NULL,
    channel_id integer NOT NULL,
    channel_name character varying(255) NOT NULL,
    channel_type character varying(50) NOT NULL,
    platform character varying(100),
    is_online boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);

CREATE SEQUENCE dw.dim_channel_channel_key_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE dw.dim_channel_channel_key_seq OWNED BY dw.dim_channel.channel_key;

CREATE TABLE dw.dim_customer (
    customer_key integer NOT NULL,
    customer_id integer NOT NULL,
    customer_code character varying(50),
    full_name character varying(255) NOT NULL,
    email character varying(255),
    province character varying(100),
    region character varying(100),
    segment_label character varying(50),
    effective_from date DEFAULT CURRENT_DATE NOT NULL,
    effective_to date,
    is_current boolean DEFAULT true NOT NULL,
    phone character varying(20),
    address text,
    district character varying(100)
);

CREATE SEQUENCE dw.dim_customer_customer_key_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE dw.dim_customer_customer_key_seq OWNED BY dw.dim_customer.customer_key;

CREATE TABLE dw.dim_date (
    date_key integer NOT NULL,
    full_date date NOT NULL,
    day_of_week smallint NOT NULL,
    day_name character varying(20) NOT NULL,
    week_number smallint NOT NULL,
    month_number smallint NOT NULL,
    month_name character varying(20) NOT NULL,
    quarter smallint NOT NULL,
    year smallint NOT NULL,
    is_weekend boolean DEFAULT false NOT NULL,
    is_holiday boolean DEFAULT false NOT NULL,
    holiday_name character varying(100),
    CONSTRAINT chk_dimdate_dow CHECK (((day_of_week >= 1) AND (day_of_week <= 7))),
    CONSTRAINT chk_dimdate_month CHECK (((month_number >= 1) AND (month_number <= 12))),
    CONSTRAINT chk_dimdate_quarter CHECK (((quarter >= 1) AND (quarter <= 4)))
);

CREATE TABLE dw.dim_payment_method (
    payment_key integer NOT NULL,
    payment_method character varying(100) NOT NULL,
    payment_type character varying(50),
    provider character varying(100)
);

CREATE SEQUENCE dw.dim_payment_method_payment_key_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE dw.dim_payment_method_payment_key_seq OWNED BY dw.dim_payment_method.payment_key;

CREATE TABLE dw.dim_product (
    product_key integer NOT NULL,
    product_id integer NOT NULL,
    sku character varying(100) NOT NULL,
    product_name character varying(500) NOT NULL,
    category_name character varying(255),
    sub_category_name character varying(255),
    base_price numeric(15,2),
    cost_price numeric(15,2),
    brand character varying(255),
    effective_from date DEFAULT CURRENT_DATE NOT NULL,
    effective_to date,
    is_current boolean DEFAULT true NOT NULL
);

CREATE SEQUENCE dw.dim_product_product_key_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE dw.dim_product_product_key_seq OWNED BY dw.dim_product.product_key;

CREATE TABLE dw.dim_region (
    region_key integer NOT NULL,
    province character varying(100) NOT NULL,
    region character varying(100),
    zone character varying(100),
    country character varying(100) DEFAULT 'Việt Nam'::character varying NOT NULL
);

CREATE SEQUENCE dw.dim_region_region_key_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE dw.dim_region_region_key_seq OWNED BY dw.dim_region.region_key;

CREATE TABLE dw.fact_ad_performance (
    ad_key integer NOT NULL,
    date_key integer NOT NULL,
    channel_key integer NOT NULL,
    product_key integer NOT NULL,
    campaign_name character varying(255),
    impressions integer DEFAULT 0 NOT NULL,
    clicks integer DEFAULT 0 NOT NULL,
    spend numeric(15,2) DEFAULT 0 NOT NULL,
    conversions integer DEFAULT 0 NOT NULL,
    revenue numeric(15,2) DEFAULT 0 NOT NULL,
    ctr numeric(8,6),
    cpc numeric(10,2),
    roas numeric(8,4),
    company_id uuid,
    CONSTRAINT chk_factad_clicks CHECK ((clicks >= 0)),
    CONSTRAINT chk_factad_impressions CHECK ((impressions >= 0)),
    CONSTRAINT chk_factad_spend CHECK ((spend >= (0)::numeric))
);

CREATE SEQUENCE dw.fact_ad_performance_ad_key_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE dw.fact_ad_performance_ad_key_seq OWNED BY dw.fact_ad_performance.ad_key;

CREATE TABLE dw.fact_payment (
    fact_payment_key integer NOT NULL,
    date_key integer NOT NULL,
    channel_key integer NOT NULL,
    payment_key integer NOT NULL,
    transaction_count integer DEFAULT 0 NOT NULL,
    total_amount numeric(15,2) DEFAULT 0 NOT NULL,
    refund_amount numeric(15,2) DEFAULT 0 NOT NULL,
    gateway_fee numeric(15,2) DEFAULT 0 NOT NULL,
    success_count integer DEFAULT 0 NOT NULL,
    fail_count integer DEFAULT 0 NOT NULL,
    success_rate numeric(5,4),
    company_id uuid,
    CONSTRAINT chk_factpay_rate CHECK ((((success_rate >= (0)::numeric) AND (success_rate <= (1)::numeric)) OR (success_rate IS NULL)))
);

CREATE SEQUENCE dw.fact_payment_fact_payment_key_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE dw.fact_payment_fact_payment_key_seq OWNED BY dw.fact_payment.fact_payment_key;

CREATE TABLE dw.fact_sales (
    sales_key integer NOT NULL,
    date_key integer NOT NULL,
    product_key integer NOT NULL,
    customer_key integer NOT NULL,
    channel_key integer NOT NULL,
    region_key integer NOT NULL,
    payment_key integer NOT NULL,
    external_order_id character varying(200),
    order_count integer DEFAULT 1 NOT NULL,
    item_quantity integer DEFAULT 0 NOT NULL,
    gross_revenue numeric(15,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(15,2) DEFAULT 0 NOT NULL,
    net_revenue numeric(15,2) DEFAULT 0 NOT NULL,
    cost_amount numeric(15,2) DEFAULT 0 NOT NULL,
    gross_profit numeric(15,2) DEFAULT 0 NOT NULL,
    profit_margin numeric(8,4),
    shipping_fee numeric(15,2) DEFAULT 0 NOT NULL,
    return_count integer DEFAULT 0 NOT NULL,
    return_amount numeric(15,2) DEFAULT 0 NOT NULL,
    company_id uuid,
    cogs_amount numeric(18,2),
    estimated_platform_fee numeric(18,2),
    estimated_payment_fee numeric(18,2),
    estimated_packaging_cost numeric(18,2),
    estimated_shipping_cost numeric(18,2),
    estimated_total_fee numeric(18,2),
    estimated_net_profit numeric(18,2),
    gross_profit_margin numeric(10,4),
    estimated_net_profit_margin numeric(10,4),
    missing_cost boolean DEFAULT false,
    is_fee_estimated boolean DEFAULT true,
    CONSTRAINT chk_factsales_margin CHECK ((((profit_margin >= ('-100'::integer)::numeric) AND (profit_margin <= (100)::numeric)) OR (profit_margin IS NULL))),
    CONSTRAINT chk_factsales_profit CHECK ((gross_profit >= (- gross_revenue))),
    CONSTRAINT chk_factsales_revenue CHECK ((gross_revenue >= (0)::numeric))
);

CREATE SEQUENCE dw.fact_sales_sales_key_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE dw.fact_sales_sales_key_seq OWNED BY dw.fact_sales.sales_key;

CREATE TABLE dw.fact_shipping (
    shipping_key integer NOT NULL,
    date_key integer NOT NULL,
    channel_key integer NOT NULL,
    region_key integer NOT NULL,
    carrier_name character varying(100),
    order_count integer DEFAULT 0 NOT NULL,
    delivered_count integer DEFAULT 0 NOT NULL,
    return_count integer DEFAULT 0 NOT NULL,
    total_shipping_fee numeric(15,2) DEFAULT 0 NOT NULL,
    avg_delivery_days numeric(5,2),
    success_rate numeric(5,4),
    company_id uuid,
    CONSTRAINT chk_factship_rate CHECK ((((success_rate >= (0)::numeric) AND (success_rate <= (1)::numeric)) OR (success_rate IS NULL)))
);

CREATE SEQUENCE dw.fact_shipping_shipping_key_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE dw.fact_shipping_shipping_key_seq OWNED BY dw.fact_shipping.shipping_key;

ALTER TABLE ONLY dw.dim_channel ALTER COLUMN channel_key SET DEFAULT nextval('dw.dim_channel_channel_key_seq'::regclass);

ALTER TABLE ONLY dw.dim_customer ALTER COLUMN customer_key SET DEFAULT nextval('dw.dim_customer_customer_key_seq'::regclass);

ALTER TABLE ONLY dw.dim_payment_method ALTER COLUMN payment_key SET DEFAULT nextval('dw.dim_payment_method_payment_key_seq'::regclass);

ALTER TABLE ONLY dw.dim_product ALTER COLUMN product_key SET DEFAULT nextval('dw.dim_product_product_key_seq'::regclass);

ALTER TABLE ONLY dw.dim_region ALTER COLUMN region_key SET DEFAULT nextval('dw.dim_region_region_key_seq'::regclass);

ALTER TABLE ONLY dw.fact_ad_performance ALTER COLUMN ad_key SET DEFAULT nextval('dw.fact_ad_performance_ad_key_seq'::regclass);

ALTER TABLE ONLY dw.fact_payment ALTER COLUMN fact_payment_key SET DEFAULT nextval('dw.fact_payment_fact_payment_key_seq'::regclass);

ALTER TABLE ONLY dw.fact_sales ALTER COLUMN sales_key SET DEFAULT nextval('dw.fact_sales_sales_key_seq'::regclass);

ALTER TABLE ONLY dw.fact_shipping ALTER COLUMN shipping_key SET DEFAULT nextval('dw.fact_shipping_shipping_key_seq'::regclass);

ALTER TABLE ONLY dw.dim_channel
    ADD CONSTRAINT dim_channel_channel_id_key UNIQUE (channel_id);

ALTER TABLE ONLY dw.dim_channel
    ADD CONSTRAINT dim_channel_pkey PRIMARY KEY (channel_key);

ALTER TABLE ONLY dw.dim_customer
    ADD CONSTRAINT dim_customer_pkey PRIMARY KEY (customer_key);

ALTER TABLE ONLY dw.dim_date
    ADD CONSTRAINT dim_date_full_date_key UNIQUE (full_date);

ALTER TABLE ONLY dw.dim_date
    ADD CONSTRAINT dim_date_pkey PRIMARY KEY (date_key);

ALTER TABLE ONLY dw.dim_payment_method
    ADD CONSTRAINT dim_payment_method_payment_method_key UNIQUE (payment_method);

ALTER TABLE ONLY dw.dim_payment_method
    ADD CONSTRAINT dim_payment_method_pkey PRIMARY KEY (payment_key);

ALTER TABLE ONLY dw.dim_product
    ADD CONSTRAINT dim_product_pkey PRIMARY KEY (product_key);

ALTER TABLE ONLY dw.dim_region
    ADD CONSTRAINT dim_region_pkey PRIMARY KEY (region_key);

ALTER TABLE ONLY dw.dim_region
    ADD CONSTRAINT dim_region_province_key UNIQUE (province);

ALTER TABLE ONLY dw.fact_ad_performance
    ADD CONSTRAINT fact_ad_performance_pkey PRIMARY KEY (ad_key);

ALTER TABLE ONLY dw.fact_payment
    ADD CONSTRAINT fact_payment_pkey PRIMARY KEY (fact_payment_key);

ALTER TABLE ONLY dw.fact_sales
    ADD CONSTRAINT fact_sales_external_order_id_key UNIQUE (external_order_id);

ALTER TABLE ONLY dw.fact_sales
    ADD CONSTRAINT fact_sales_pkey PRIMARY KEY (sales_key);

ALTER TABLE ONLY dw.fact_shipping
    ADD CONSTRAINT fact_shipping_pkey PRIMARY KEY (shipping_key);

ALTER TABLE ONLY dw.fact_ad_performance
    ADD CONSTRAINT fact_ad_performance_channel_key_fkey FOREIGN KEY (channel_key) REFERENCES dw.dim_channel(channel_key);

ALTER TABLE ONLY dw.fact_ad_performance
    ADD CONSTRAINT fact_ad_performance_date_key_fkey FOREIGN KEY (date_key) REFERENCES dw.dim_date(date_key);

ALTER TABLE ONLY dw.fact_ad_performance
    ADD CONSTRAINT fact_ad_performance_product_key_fkey FOREIGN KEY (product_key) REFERENCES dw.dim_product(product_key);

ALTER TABLE ONLY dw.fact_payment
    ADD CONSTRAINT fact_payment_channel_key_fkey FOREIGN KEY (channel_key) REFERENCES dw.dim_channel(channel_key);

ALTER TABLE ONLY dw.fact_payment
    ADD CONSTRAINT fact_payment_date_key_fkey FOREIGN KEY (date_key) REFERENCES dw.dim_date(date_key);

ALTER TABLE ONLY dw.fact_payment
    ADD CONSTRAINT fact_payment_payment_key_fkey FOREIGN KEY (payment_key) REFERENCES dw.dim_payment_method(payment_key);

ALTER TABLE ONLY dw.fact_sales
    ADD CONSTRAINT fact_sales_channel_key_fkey FOREIGN KEY (channel_key) REFERENCES dw.dim_channel(channel_key);

ALTER TABLE ONLY dw.fact_sales
    ADD CONSTRAINT fact_sales_customer_key_fkey FOREIGN KEY (customer_key) REFERENCES dw.dim_customer(customer_key);

ALTER TABLE ONLY dw.fact_sales
    ADD CONSTRAINT fact_sales_date_key_fkey FOREIGN KEY (date_key) REFERENCES dw.dim_date(date_key);

ALTER TABLE ONLY dw.fact_sales
    ADD CONSTRAINT fact_sales_payment_key_fkey FOREIGN KEY (payment_key) REFERENCES dw.dim_payment_method(payment_key);

ALTER TABLE ONLY dw.fact_sales
    ADD CONSTRAINT fact_sales_product_key_fkey FOREIGN KEY (product_key) REFERENCES dw.dim_product(product_key);

ALTER TABLE ONLY dw.fact_sales
    ADD CONSTRAINT fact_sales_region_key_fkey FOREIGN KEY (region_key) REFERENCES dw.dim_region(region_key);

ALTER TABLE ONLY dw.fact_shipping
    ADD CONSTRAINT fact_shipping_channel_key_fkey FOREIGN KEY (channel_key) REFERENCES dw.dim_channel(channel_key);

ALTER TABLE ONLY dw.fact_shipping
    ADD CONSTRAINT fact_shipping_date_key_fkey FOREIGN KEY (date_key) REFERENCES dw.dim_date(date_key);

ALTER TABLE ONLY dw.fact_shipping
    ADD CONSTRAINT fact_shipping_region_key_fkey FOREIGN KEY (region_key) REFERENCES dw.dim_region(region_key);