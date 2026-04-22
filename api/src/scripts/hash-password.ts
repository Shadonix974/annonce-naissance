import argon2 from "argon2";

const pw = process.argv[2];
if (!pw) {
  // eslint-disable-next-line no-console
  console.error("Usage: npm run hash-password -- <password>");
  process.exit(1);
}

const hash = await argon2.hash(pw, { type: argon2.argon2id });

// docker compose interpolates $VAR references when loading .env, which mangles
// the argon2 hash (it contains $argon2id$v$m$… patterns). The value needs to
// have every $ doubled so compose substitutes $$ back to a single $.
const escaped = hash.replace(/\$/g, "$$$$");

// eslint-disable-next-line no-console
console.log(`Raw hash (for reference):
  ${hash}

Paste THIS line into your .env (dollar signs escaped for docker compose):
  ADMIN_PASSWORD_HASH=${escaped}
`);
