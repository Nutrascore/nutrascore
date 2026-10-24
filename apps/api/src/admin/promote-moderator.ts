import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '../../.env' });
dotenv.config();

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
	console.error('Usage: pnpm --filter api admin:promote-moderator -- user@example.com');
	process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
	const result = await pool.query(
		`UPDATE "Users" SET role = 'moderator', updated_at = NOW()
		 WHERE email = $1
		 RETURNING id, name, email, role`,
		[email],
	);
	if (!result.rowCount) {
		console.error('No account exists for that email. Register the account first.');
		process.exitCode = 1;
	} else {
		console.log(`Promoted ${result.rows[0].email} to ${result.rows[0].role}.`);
	}
} finally {
	await pool.end();
}
