CREATE TABLE IF NOT EXISTS "Users" (
  id uuid PRIMARY KEY,
  name varchar(120) NOT NULL,
  email varchar(320) NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role varchar(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON user_sessions (user_id);
CREATE INDEX IF NOT EXISTS user_sessions_expires_at_idx ON user_sessions (expires_at);

CREATE TABLE IF NOT EXISTS product_likes (
  user_id uuid NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES "Products"(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS product_likes_product_id_idx ON product_likes (product_id);

CREATE TABLE IF NOT EXISTS product_favourites (
  user_id uuid NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES "Products"(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS product_favourites_product_id_idx ON product_favourites (product_id);

CREATE TABLE IF NOT EXISTS product_image_reviews (
  product_id uuid PRIMARY KEY REFERENCES "Products"(id) ON DELETE CASCADE,
  review_status varchar(20) NOT NULL DEFAULT 'needs_review'
    CHECK (review_status IN ('verified', 'needs_review')),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
