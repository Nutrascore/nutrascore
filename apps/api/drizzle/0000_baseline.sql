CREATE TABLE IF NOT EXISTS "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_categories" (
	"product_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "product_categories_product_id_category_id_pk" PRIMARY KEY("product_id","category_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"brand" varchar,
	"barcode" varchar,
	"ingredients" text,
	"image_url" text,
	"price_inr" numeric,
	"kcal_per_100g" numeric,
	"fat_g" numeric,
	"saturated_fat_g" numeric,
	"trans_fat_g" numeric,
	"carbohydrates_g" numeric,
	"sugars_g" numeric,
	"fibre_g" numeric,
	"protein_g" numeric,
	"sodium_mg" numeric,
	"salt_g" numeric,
	"cholesterol_mg" numeric,
	"calcium_mg" numeric,
	"iron_mg" numeric,
	"vitamins" text,
	"serving_size" numeric,
	"serving_unit" varchar(20),
	"nutrition_basis" varchar(20),
	CONSTRAINT "Products_barcode_unique" UNIQUE("barcode"),
	CONSTRAINT "Products_nutrition_basis_check" CHECK ("Products"."nutrition_basis" in ('per_serving', 'per_100g') or "Products"."nutrition_basis" is null)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text NOT NULL,
	"role" varchar(20) DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "Users_email_unique" UNIQUE("email"),
	CONSTRAINT "Users_role_check" CHECK ("Users"."role" in ('user', 'moderator'))
);
--> statement-breakpoint
DO $baseline_columns$
DECLARE
	column_spec record;
	existing_type text;
	existing_not_null boolean;
	existing_default text;
	expected_default text;
	has_rows boolean;
BEGIN
	FOR column_spec IN
		SELECT * FROM (VALUES
			('Products'::text, 'id'::text, 'uuid'::text, true, NULL::text),
			('Products', 'name', 'character varying', true, NULL),
			('Products', 'brand', 'character varying', false, NULL),
			('Products', 'barcode', 'character varying', false, NULL),
			('Products', 'ingredients', 'text', false, NULL),
			('Products', 'image_url', 'text', false, NULL),
			('Products', 'price_inr', 'numeric', false, NULL),
			('Products', 'kcal_per_100g', 'numeric', false, NULL),
			('Products', 'fat_g', 'numeric', false, NULL),
			('Products', 'saturated_fat_g', 'numeric', false, NULL),
			('Products', 'trans_fat_g', 'numeric', false, NULL),
			('Products', 'carbohydrates_g', 'numeric', false, NULL),
			('Products', 'sugars_g', 'numeric', false, NULL),
			('Products', 'fibre_g', 'numeric', false, NULL),
			('Products', 'protein_g', 'numeric', false, NULL),
			('Products', 'sodium_mg', 'numeric', false, NULL),
			('Products', 'salt_g', 'numeric', false, NULL),
			('Products', 'cholesterol_mg', 'numeric', false, NULL),
			('Products', 'calcium_mg', 'numeric', false, NULL),
			('Products', 'iron_mg', 'numeric', false, NULL),
			('Products', 'vitamins', 'text', false, NULL),
			('Products', 'serving_size', 'numeric', false, NULL),
			('Products', 'serving_unit', 'character varying(20)', false, NULL),
			('Products', 'nutrition_basis', 'character varying(20)', false, NULL),
			('Users', 'id', 'uuid', true, NULL),
			('Users', 'name', 'character varying(120)', true, NULL),
			('Users', 'email', 'character varying(320)', true, NULL),
			('Users', 'password_hash', 'text', true, NULL),
			('Users', 'role', 'character varying(20)', true, '''user''::character varying'),
			('Users', 'created_at', 'timestamp with time zone', true, 'now()'),
			('Users', 'updated_at', 'timestamp with time zone', true, 'now()'),
			('user_sessions', 'id', 'uuid', true, NULL),
			('user_sessions', 'user_id', 'uuid', true, NULL),
			('user_sessions', 'token_hash', 'character varying(64)', true, NULL),
			('user_sessions', 'expires_at', 'timestamp with time zone', true, NULL),
			('user_sessions', 'created_at', 'timestamp with time zone', true, 'now()'),
			('categories', 'id', 'uuid', true, NULL),
			('categories', 'name', 'character varying', true, NULL),
			('categories', 'description', 'text', false, NULL),
			('product_categories', 'product_id', 'uuid', true, NULL),
			('product_categories', 'category_id', 'uuid', true, NULL)
		) AS expected(table_name, column_name, data_type, not_null, default_expression)
	LOOP
		SELECT
			format_type(attribute.atttypid, attribute.atttypmod),
			attribute.attnotnull,
			pg_get_expr(column_default.adbin, column_default.adrelid)
		INTO existing_type, existing_not_null, existing_default
		FROM pg_attribute AS attribute
		LEFT JOIN pg_attrdef AS column_default
			ON column_default.adrelid = attribute.attrelid
		   AND column_default.adnum = attribute.attnum
		WHERE attribute.attrelid = format('public.%I', column_spec.table_name)::regclass
		  AND attribute.attname = column_spec.column_name
		  AND attribute.attnum > 0
		  AND NOT attribute.attisdropped;

		IF NOT FOUND THEN
			IF column_spec.not_null AND column_spec.default_expression IS NULL THEN
				EXECUTE format(
					'SELECT EXISTS (SELECT 1 FROM public.%I LIMIT 1)',
					column_spec.table_name
				) INTO has_rows;
				IF has_rows THEN
					RAISE EXCEPTION
						'Cannot add required column %.% to a populated table without a safe value',
						column_spec.table_name, column_spec.column_name;
				END IF;
			END IF;

			EXECUTE format(
				'ALTER TABLE public.%I ADD COLUMN %I %s%s%s',
				column_spec.table_name,
				column_spec.column_name,
				column_spec.data_type,
				CASE WHEN column_spec.not_null THEN ' NOT NULL' ELSE '' END,
				CASE
					WHEN column_spec.default_expression IS NOT NULL
					THEN ' DEFAULT ' || column_spec.default_expression
					ELSE ''
				END
			);
		ELSE
			IF existing_type IS DISTINCT FROM column_spec.data_type THEN
				RAISE EXCEPTION
					'Incompatible column %.%: expected type %, found %',
					column_spec.table_name, column_spec.column_name,
					column_spec.data_type, existing_type;
			END IF;
			IF existing_not_null IS DISTINCT FROM column_spec.not_null THEN
				RAISE EXCEPTION
					'Incompatible column %.%: expected NOT NULL %, found %',
					column_spec.table_name, column_spec.column_name,
					column_spec.not_null, existing_not_null;
			END IF;

			expected_default := CASE
				WHEN column_spec.default_expression IS NULL THEN NULL
				ELSE regexp_replace(
					lower(column_spec.default_expression),
					'[[:space:]()]',
					'',
					'g'
				)
			END;
			IF regexp_replace(
				lower(COALESCE(existing_default, '')),
				'[[:space:]()]',
				'',
				'g'
			) IS DISTINCT FROM COALESCE(expected_default, '') THEN
				RAISE EXCEPTION
					'Incompatible column %.% default: expected %, found %',
					column_spec.table_name, column_spec.column_name,
					column_spec.default_expression, existing_default;
			END IF;
		END IF;
	END LOOP;
END;
$baseline_columns$;
--> statement-breakpoint
-- Keep retained legacy timestamp columns usable by current product inserts.
DO $legacy_product_timestamps$
DECLARE
	legacy_column text;
	column_type text;
	column_not_null boolean;
	column_default text;
BEGIN
	FOREACH legacy_column IN ARRAY ARRAY['created_at', 'updated_at'] LOOP
		SELECT
			format_type(attribute.atttypid, attribute.atttypmod),
			attribute.attnotnull,
			pg_get_expr(column_default.adbin, column_default.adrelid)
		INTO column_type, column_not_null, column_default
		FROM pg_attribute AS attribute
		LEFT JOIN pg_attrdef AS column_default
			ON column_default.adrelid = attribute.attrelid
		   AND column_default.adnum = attribute.attnum
		WHERE attribute.attrelid = 'public."Products"'::regclass
		  AND attribute.attname = legacy_column
		  AND attribute.attnum > 0
		  AND NOT attribute.attisdropped;

		IF FOUND THEN
			IF column_type <> 'timestamp with time zone' OR NOT column_not_null THEN
				RAISE EXCEPTION
					'Incompatible legacy Products.%: expected NOT NULL timestamp with time zone',
					legacy_column;
			END IF;
			IF column_default IS NULL THEN
				EXECUTE format(
					'ALTER TABLE public."Products" ALTER COLUMN %I SET DEFAULT now()',
					legacy_column
				);
			ELSIF regexp_replace(
				lower(column_default),
				'[[:space:]()]',
				'',
				'g'
			) <> 'now' THEN
				RAISE EXCEPTION
					'Incompatible legacy Products.% default: expected now(), found %',
					legacy_column, column_default;
			END IF;
		END IF;
	END LOOP;
END;
$legacy_product_timestamps$;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'Products_nutrition_basis_check'
		  AND conrelid = 'public."Products"'::regclass
		  AND (
			contype <> 'c'
			OR regexp_replace(
				lower(pg_get_constraintdef(oid, true)),
				'[[:space:]()]',
				'',
				'g'
			) <> 'checknutrition_basis::text=anyarray[''per_serving''::charactervarying,''per_100g''::charactervarying]::text[]ornutrition_basisisnull'
		  )
	) THEN
		RAISE EXCEPTION 'Incompatible constraint Products_nutrition_basis_check on Products';
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public."Products"'::regclass
		  AND contype = 'c'
		  AND regexp_replace(
			lower(pg_get_constraintdef(oid, true)),
			'[[:space:]()]',
			'',
			'g'
		  ) = 'checknutrition_basis::text=anyarray[''per_serving''::charactervarying,''per_100g''::charactervarying]::text[]ornutrition_basisisnull'
	) THEN
		ALTER TABLE "Products"
			ADD CONSTRAINT "Products_nutrition_basis_check"
			CHECK (nutrition_basis IN ('per_serving', 'per_100g') OR nutrition_basis IS NULL);
	END IF;
END;
$$;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'Users_role_check'
		  AND conrelid = 'public."Users"'::regclass
		  AND (
			contype <> 'c'
			OR regexp_replace(
				lower(pg_get_constraintdef(oid, true)),
				'[[:space:]()]',
				'',
				'g'
			) NOT IN (
				'checkrole::text=anyarray[''user''::charactervarying,''moderator''::charactervarying]::text[]',
				'checkrole::text=anyarray[''user''::charactervarying::text,''moderator''::charactervarying::text]'
			)
		  )
	) THEN
		RAISE EXCEPTION 'Incompatible constraint Users_role_check on Users';
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public."Users"'::regclass
		  AND contype = 'c'
		  AND regexp_replace(
			lower(pg_get_constraintdef(oid, true)),
			'[[:space:]()]',
			'',
			'g'
		  ) IN (
			'checkrole::text=anyarray[''user''::charactervarying,''moderator''::charactervarying]::text[]',
			'checkrole::text=anyarray[''user''::charactervarying::text,''moderator''::charactervarying::text]'
		  )
	) THEN
		ALTER TABLE "Users"
			ADD CONSTRAINT "Users_role_check"
			CHECK (role IN ('user', 'moderator'));
	END IF;
END;
$$;
--> statement-breakpoint
DO $baseline_keys$
DECLARE
	constraint_spec record;
	expected_attnums smallint[];
	existing_count integer;
	primary_key_matches boolean;
	equivalent_index_count integer;
BEGIN
	FOR constraint_spec IN
		SELECT * FROM (VALUES
			('Products'::text, 'Products_pkey'::text, 'primary'::text, ARRAY['id']::text[]),
			('Users', 'Users_pkey', 'primary', ARRAY['id']::text[]),
			('user_sessions', 'user_sessions_pkey', 'primary', ARRAY['id']::text[]),
			('categories', 'categories_pkey', 'primary', ARRAY['id']::text[]),
			('product_categories', 'product_categories_product_id_category_id_pk', 'primary', ARRAY['product_id', 'category_id']::text[]),
			('Products', 'Products_barcode_unique', 'unique', ARRAY['barcode']::text[]),
			('Users', 'Users_email_unique', 'unique', ARRAY['email']::text[]),
			('user_sessions', 'user_sessions_token_hash_unique', 'unique', ARRAY['token_hash']::text[]),
			('categories', 'categories_name_unique', 'unique', ARRAY['name']::text[])
		) AS expected(table_name, constraint_name, constraint_type, columns)
	LOOP
		expected_attnums := ARRAY(
			SELECT attribute.attnum::smallint
			FROM unnest(constraint_spec.columns) WITH ORDINALITY AS column_name(name, ordinal)
			JOIN pg_attribute AS attribute
				ON attribute.attrelid = format('public.%I', constraint_spec.table_name)::regclass
			   AND attribute.attname = column_name.name
			   AND attribute.attnum > 0
			   AND NOT attribute.attisdropped
			ORDER BY column_name.ordinal
		);
		IF cardinality(expected_attnums) <> cardinality(constraint_spec.columns) THEN
			RAISE EXCEPTION
				'Cannot verify %.% because one or more key columns are missing',
				constraint_spec.table_name, constraint_spec.constraint_name;
		END IF;

		IF EXISTS (
			SELECT 1
			FROM pg_constraint AS constraint_row
			WHERE constraint_row.conrelid =
				format('public.%I', constraint_spec.table_name)::regclass
			  AND constraint_row.conname = constraint_spec.constraint_name
			  AND (
				(constraint_spec.constraint_type = 'primary' AND (
					constraint_row.contype <> 'p'
					OR constraint_row.conkey <> expected_attnums
				))
				OR (constraint_spec.constraint_type = 'unique' AND (
					constraint_row.contype <> 'u'
					OR constraint_row.conkey <> expected_attnums
				))
			  )
		) THEN
			RAISE EXCEPTION
				'Incompatible constraint named % on table %',
				constraint_spec.constraint_name, constraint_spec.table_name;
		END IF;

		IF constraint_spec.constraint_type = 'primary' THEN
			SELECT count(*), COALESCE(bool_and(constraint_row.conkey = expected_attnums), false)
			INTO existing_count, primary_key_matches
			FROM pg_constraint AS constraint_row
			WHERE constraint_row.conrelid =
				format('public.%I', constraint_spec.table_name)::regclass
			  AND constraint_row.contype = 'p';

			IF existing_count > 1 OR (existing_count = 1 AND NOT primary_key_matches) THEN
				RAISE EXCEPTION
					'Incompatible primary key on table %; expected columns %',
					constraint_spec.table_name, constraint_spec.columns;
			END IF;

			IF existing_count = 0 THEN
				EXECUTE format(
					'ALTER TABLE public.%I ADD CONSTRAINT %I PRIMARY KEY (%s)',
					constraint_spec.table_name,
					constraint_spec.constraint_name,
					(SELECT string_agg(format('%I', name), ', ' ORDER BY ordinal)
					 FROM unnest(constraint_spec.columns) WITH ORDINALITY AS column_name(name, ordinal))
				);
			END IF;
		ELSE
			IF EXISTS (
				SELECT 1
				FROM pg_constraint AS constraint_row
				WHERE constraint_row.conrelid =
					format('public.%I', constraint_spec.table_name)::regclass
				  AND constraint_row.conname = constraint_spec.constraint_name
				  AND (
					constraint_row.contype <> 'u'
					OR constraint_row.conkey <> expected_attnums
				  )
			) THEN
				RAISE EXCEPTION
					'Incompatible constraint named % on table %',
					constraint_spec.constraint_name, constraint_spec.table_name;
			END IF;

			IF EXISTS (
				SELECT 1
				FROM pg_class AS index_class
				JOIN pg_namespace AS index_schema ON index_schema.oid = index_class.relnamespace
				WHERE index_schema.nspname = 'public'
				  AND index_class.relname = constraint_spec.constraint_name
				  AND index_class.relkind = 'i'
				  AND NOT EXISTS (
					SELECT 1
					FROM pg_index AS index_row
					WHERE index_row.indexrelid = index_class.oid
					  AND index_row.indrelid =
						format('public.%I', constraint_spec.table_name)::regclass
					  AND index_row.indisunique
					  AND index_row.indisvalid
					  AND index_row.indisready
					  AND index_row.indpred IS NULL
					  AND index_row.indexprs IS NULL
					  AND index_row.indnkeyatts = cardinality(expected_attnums)
					  AND index_row.indnatts = cardinality(expected_attnums)
					  AND ARRAY(
						SELECT key_column.attnum::smallint
						FROM unnest(index_row.indkey::smallint[]) WITH ORDINALITY AS key_column(attnum, ordinal)
						ORDER BY key_column.ordinal
					  ) = expected_attnums
				  )
			) THEN
				RAISE EXCEPTION
					'Incompatible index named % on table %',
					constraint_spec.constraint_name, constraint_spec.table_name;
			END IF;

			SELECT count(*)
			INTO equivalent_index_count
			FROM pg_index AS index_row
			JOIN pg_class AS index_class ON index_class.oid = index_row.indexrelid
			WHERE index_row.indrelid =
				format('public.%I', constraint_spec.table_name)::regclass
			  AND index_row.indisunique
			  AND index_row.indisvalid
			  AND index_row.indisready
			  AND index_row.indpred IS NULL
			  AND index_row.indexprs IS NULL
			  AND index_row.indnkeyatts = cardinality(expected_attnums)
			  AND index_row.indnatts = cardinality(expected_attnums)
			  AND ARRAY(
				SELECT key_column.attnum::smallint
				FROM unnest(index_row.indkey::smallint[]) WITH ORDINALITY AS key_column(attnum, ordinal)
				ORDER BY key_column.ordinal
			  ) = expected_attnums;

			IF equivalent_index_count > 1 THEN
				RAISE EXCEPTION
					'Duplicate unique indexes on %.%: % equivalent indexes found',
					constraint_spec.table_name, constraint_spec.columns, equivalent_index_count;
			END IF;

			IF equivalent_index_count = 0 THEN
				EXECUTE format(
					'ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE (%s)',
					constraint_spec.table_name,
					constraint_spec.constraint_name,
					(SELECT string_agg(format('%I', name), ', ' ORDER BY ordinal)
					 FROM unnest(constraint_spec.columns) WITH ORDINALITY AS column_name(name, ordinal))
				);
			END IF;
		END IF;
	END LOOP;
END;
$baseline_keys$;
--> statement-breakpoint
DO $baseline_foreign_keys$
DECLARE
	foreign_key_spec record;
	source_attnums smallint[];
	target_attnums smallint[];
	existing_count integer;
	exact_count integer;
	existing_constraint_name text;
	orphan_count integer;
	source_join_column text;
	target_join_column text;
BEGIN
	FOR foreign_key_spec IN
		SELECT * FROM (VALUES
			('product_categories'::text, 'product_categories_product_id_Products_id_fk'::text, ARRAY['product_id']::text[], 'Products'::text, ARRAY['id']::text[], 'c'::text, ARRAY['product_categories_product_id_fkey', 'product_categories_product_id_Products_id_fk']::text[]),
			('product_categories', 'product_categories_category_id_categories_id_fk', ARRAY['category_id']::text[], 'categories', ARRAY['id']::text[], 'c', ARRAY['product_categories_category_id_fkey', 'product_categories_category_id_categories_id_fk']::text[]),
			('user_sessions', 'user_sessions_user_id_Users_id_fk', ARRAY['user_id']::text[], 'Users', ARRAY['id']::text[], 'c', ARRAY[]::text[])
		) AS expected(source_table, constraint_name, source_columns, target_table, target_columns, delete_action, legacy_constraint_names)
	LOOP
		source_attnums := ARRAY(
			SELECT attribute.attnum::smallint
			FROM unnest(foreign_key_spec.source_columns) WITH ORDINALITY AS column_name(name, ordinal)
			JOIN pg_attribute AS attribute
				ON attribute.attrelid = format('public.%I', foreign_key_spec.source_table)::regclass
			   AND attribute.attname = column_name.name
			   AND attribute.attnum > 0
			   AND NOT attribute.attisdropped
			ORDER BY column_name.ordinal
		);
		target_attnums := ARRAY(
			SELECT attribute.attnum::smallint
			FROM unnest(foreign_key_spec.target_columns) WITH ORDINALITY AS column_name(name, ordinal)
			JOIN pg_attribute AS attribute
				ON attribute.attrelid = format('public.%I', foreign_key_spec.target_table)::regclass
			   AND attribute.attname = column_name.name
			   AND attribute.attnum > 0
			   AND NOT attribute.attisdropped
			ORDER BY column_name.ordinal
		);

		SELECT
			count(*),
			count(*) FILTER (
				WHERE constraint_row.confrelid =
					format('public.%I', foreign_key_spec.target_table)::regclass
				  AND constraint_row.confkey = target_attnums
				  AND constraint_row.confdeltype = foreign_key_spec.delete_action
				  AND constraint_row.confupdtype = 'a'
				  AND NOT constraint_row.condeferrable
				  AND NOT constraint_row.condeferred
				  AND constraint_row.convalidated
			),
			min(constraint_row.conname)
		INTO existing_count, exact_count, existing_constraint_name
		FROM pg_constraint AS constraint_row
		WHERE constraint_row.conrelid =
			format('public.%I', foreign_key_spec.source_table)::regclass
		  AND constraint_row.contype = 'f'
		  AND constraint_row.conkey = source_attnums;

		IF existing_count > 1 THEN
			RAISE EXCEPTION
				'Incompatible foreign key on %.%: expected reference to %.% with ON DELETE CASCADE, ON UPDATE NO ACTION, and NOT DEFERRABLE',
				foreign_key_spec.source_table, foreign_key_spec.source_columns,
				foreign_key_spec.target_table, foreign_key_spec.target_columns;
		END IF;

		IF existing_count = 1 AND exact_count = 1 THEN
			IF existing_constraint_name <> foreign_key_spec.constraint_name THEN
				IF EXISTS (
					SELECT 1
					FROM pg_constraint AS constraint_row
					WHERE constraint_row.conrelid =
						format('public.%I', foreign_key_spec.source_table)::regclass
					  AND constraint_row.conname = foreign_key_spec.constraint_name
				) THEN
					RAISE EXCEPTION
						'Cannot rename foreign key on % because constraint name % is already in use',
						foreign_key_spec.source_table, foreign_key_spec.constraint_name;
				END IF;
				EXECUTE format(
					'ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I',
					foreign_key_spec.source_table,
					existing_constraint_name,
					foreign_key_spec.constraint_name
				);
			END IF;
			CONTINUE;
		END IF;

		IF existing_count = 1 AND NOT (
			existing_constraint_name = ANY(foreign_key_spec.legacy_constraint_names)
			AND EXISTS (
				SELECT 1
				FROM pg_constraint AS constraint_row
				WHERE constraint_row.conrelid =
					format('public.%I', foreign_key_spec.source_table)::regclass
				  AND constraint_row.conname = existing_constraint_name
				  AND constraint_row.contype = 'f'
				  AND constraint_row.conkey = source_attnums
				  AND constraint_row.confrelid =
					format('public.%I', foreign_key_spec.target_table)::regclass
				  AND constraint_row.confkey = target_attnums
				  AND constraint_row.confdeltype = 'a'
				  AND constraint_row.confupdtype = 'a'
				  AND constraint_row.condeferrable
				  AND NOT constraint_row.condeferred
				  AND constraint_row.convalidated
			)
		) THEN
			RAISE EXCEPTION
				'Incompatible foreign key on %.%: found constraint %, expected the known legacy definition or ON DELETE CASCADE NOT DEFERRABLE',
				foreign_key_spec.source_table, foreign_key_spec.source_columns, existing_constraint_name;
		END IF;

		source_join_column := foreign_key_spec.source_columns[1];
		target_join_column := foreign_key_spec.target_columns[1];
		EXECUTE format(
			'SELECT count(*) FROM public.%I AS source_table LEFT JOIN public.%I AS target_table ON target_table.%I = source_table.%I WHERE source_table.%I IS NOT NULL AND target_table.%I IS NULL',
			foreign_key_spec.source_table,
			foreign_key_spec.target_table,
			target_join_column,
			source_join_column,
			source_join_column,
			target_join_column
		) INTO orphan_count;
		IF orphan_count > 0 THEN
			RAISE EXCEPTION
				'Cannot create or repair foreign key on %.% because orphaned records exist',
				foreign_key_spec.source_table, foreign_key_spec.source_columns;
		END IF;

		IF existing_count = 1 THEN
			EXECUTE format(
				'ALTER TABLE public.%I DROP CONSTRAINT %I',
				foreign_key_spec.source_table,
				existing_constraint_name
			);
		END IF;

		EXECUTE format(
			'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES public.%I (%s) ON DELETE CASCADE ON UPDATE NO ACTION NOT DEFERRABLE',
			foreign_key_spec.source_table,
			foreign_key_spec.constraint_name,
			(SELECT string_agg(format('%I', name), ', ' ORDER BY ordinal)
			 FROM unnest(foreign_key_spec.source_columns) WITH ORDINALITY AS column_name(name, ordinal)),
			foreign_key_spec.target_table,
			(SELECT string_agg(format('%I', name), ', ' ORDER BY ordinal)
			 FROM unnest(foreign_key_spec.target_columns) WITH ORDINALITY AS column_name(name, ordinal))
		);
	END LOOP;
END;
$baseline_foreign_keys$;
--> statement-breakpoint
DO $baseline_indexes$
DECLARE
	index_spec record;
	expected_attnums smallint[];
	existing_count integer;
	equivalent_count integer;
BEGIN
	FOR index_spec IN
		SELECT * FROM (VALUES
			('user_sessions'::text, 'user_sessions_user_id_idx'::text, ARRAY['user_id']::text[]),
			('user_sessions', 'user_sessions_expires_at_idx', ARRAY['expires_at']::text[])
		) AS expected(table_name, index_name, columns)
	LOOP
		expected_attnums := ARRAY(
			SELECT attribute.attnum::smallint
			FROM unnest(index_spec.columns) WITH ORDINALITY AS column_name(name, ordinal)
			JOIN pg_attribute AS attribute
				ON attribute.attrelid = format('public.%I', index_spec.table_name)::regclass
			   AND attribute.attname = column_name.name
			   AND attribute.attnum > 0
			   AND NOT attribute.attisdropped
			ORDER BY column_name.ordinal
		);

		SELECT count(*)
		INTO equivalent_count
		FROM pg_index AS index_row
		JOIN pg_class AS index_class ON index_class.oid = index_row.indexrelid
		JOIN pg_am AS access_method ON access_method.oid = index_class.relam
		WHERE index_row.indrelid = format('public.%I', index_spec.table_name)::regclass
		  AND index_class.relname = index_spec.index_name
		  AND NOT index_row.indisunique
		  AND index_row.indisvalid
		  AND index_row.indisready
		  AND index_row.indpred IS NULL
		  AND index_row.indexprs IS NULL
		  AND access_method.amname = 'btree'
		  AND index_row.indnkeyatts = cardinality(expected_attnums)
		  AND index_row.indnatts = cardinality(expected_attnums)
		  AND ARRAY(
			SELECT key_column.attnum::smallint
			FROM unnest(index_row.indkey::smallint[]) WITH ORDINALITY AS key_column(attnum, ordinal)
			ORDER BY key_column.ordinal
		  ) = expected_attnums;

		SELECT count(*)
		INTO existing_count
		FROM pg_class AS index_class
		JOIN pg_namespace AS index_schema ON index_schema.oid = index_class.relnamespace
		WHERE index_schema.nspname = 'public'
		  AND index_class.relname = index_spec.index_name
		  AND index_class.relkind = 'i';

		IF existing_count > 0 AND equivalent_count <> 1 THEN
			RAISE EXCEPTION 'Incompatible index % on table %', index_spec.index_name, index_spec.table_name;
		END IF;

		SELECT count(*)
		INTO equivalent_count
		FROM pg_index AS index_row
		JOIN pg_class AS index_class ON index_class.oid = index_row.indexrelid
		JOIN pg_am AS access_method ON access_method.oid = index_class.relam
		WHERE index_row.indrelid = format('public.%I', index_spec.table_name)::regclass
		  AND NOT index_row.indisunique
		  AND index_row.indisvalid
		  AND index_row.indisready
		  AND index_row.indpred IS NULL
		  AND index_row.indexprs IS NULL
		  AND access_method.amname = 'btree'
		  AND index_row.indnkeyatts = cardinality(expected_attnums)
		  AND index_row.indnatts = cardinality(expected_attnums)
		  AND ARRAY(
			SELECT key_column.attnum::smallint
			FROM unnest(index_row.indkey::smallint[]) WITH ORDINALITY AS key_column(attnum, ordinal)
			ORDER BY key_column.ordinal
		  ) = expected_attnums;

		IF equivalent_count > 1 THEN
			RAISE EXCEPTION 'Duplicate indexes on %.%', index_spec.table_name, index_spec.columns;
		END IF;

		IF equivalent_count = 0 THEN
			EXECUTE format(
				'CREATE INDEX %I ON public.%I USING btree (%s)',
				index_spec.index_name,
				index_spec.table_name,
				(SELECT string_agg(format('%I', name), ', ' ORDER BY ordinal)
				 FROM unnest(index_spec.columns) WITH ORDINALITY AS column_name(name, ordinal))
			);
		END IF;
	END LOOP;
END;
$baseline_indexes$;
--> statement-breakpoint
DO $$
BEGIN
	IF to_regclass('public."ProductImages"') IS NOT NULL THEN
		EXECUTE $images$
			UPDATE "Products" AS product
			SET image_url = (
				SELECT image_url
				FROM "ProductImages"
				WHERE product_id = product.id
				  AND is_primary = true
				ORDER BY id
				LIMIT 1
			)
			WHERE product.image_url IS NULL
			  AND EXISTS (
				SELECT 1
				FROM "ProductImages"
				WHERE product_id = product.id
				  AND is_primary = true
			  )
		$images$;
	END IF;

	IF to_regclass('public."Nutrition"') IS NOT NULL THEN
		EXECUTE $nutrition$
			UPDATE "Products" AS product
			SET kcal_per_100g = COALESCE(product.kcal_per_100g, nutrition.kcal_per_100g),
				fat_g = COALESCE(product.fat_g, nutrition.fat_g),
				saturated_fat_g = COALESCE(product.saturated_fat_g, nutrition.saturated_fat_g),
				trans_fat_g = COALESCE(product.trans_fat_g, nutrition.trans_fat_g),
				carbohydrates_g = COALESCE(product.carbohydrates_g, nutrition.carbohydrates_g),
				sugars_g = COALESCE(product.sugars_g, nutrition.sugars_g),
				fibre_g = COALESCE(product.fibre_g, nutrition.fibre_g),
				protein_g = COALESCE(product.protein_g, nutrition.protein_g),
				sodium_mg = COALESCE(product.sodium_mg, nutrition.sodium_mg),
				salt_g = COALESCE(product.salt_g, nutrition.salt_g),
				cholesterol_mg = COALESCE(product.cholesterol_mg, nutrition.cholesterol_mg),
				calcium_mg = COALESCE(product.calcium_mg, nutrition.calcium_mg),
				iron_mg = COALESCE(product.iron_mg, nutrition.iron_mg),
				vitamins = COALESCE(product.vitamins, nutrition.vitamins),
				serving_size = COALESCE(product.serving_size, nutrition.serving_size),
				serving_unit = COALESCE(product.serving_unit, nutrition.serving_unit),
				nutrition_basis = COALESCE(product.nutrition_basis, nutrition.nutrition_basis)
			FROM "Nutrition" AS nutrition
			WHERE nutrition.product_id = product.id
		$nutrition$;
	END IF;
END;
$$;