CREATE TABLE IF NOT EXISTS product_image_sources (
  product_id uuid PRIMARY KEY REFERENCES "Products"(id),
  source_name varchar NOT NULL,
  source_url text NOT NULL,
  match_confidence numeric NOT NULL,
  license_metadata text,
  verified_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS product_barcode_sources (
  product_id uuid PRIMARY KEY REFERENCES "Products"(id),
  source_name varchar NOT NULL,
  lookup_date timestamptz NOT NULL,
  matched_name text,
  matched_brand text,
  confidence numeric,
  verification_status varchar NOT NULL,
  source_url text
);
