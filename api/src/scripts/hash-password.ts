import argon2 from "argon2";

const pw = process.argv[2];
if (!pw) {
  // eslint-disable-next-line no-console
  console.error("Usage: npm run hash-password -- <password>");
  process.exit(1);
}

const hash = await argon2.hash(pw, { type: argon2.argon2id });
// eslint-disable-next-line no-console
console.log(hash);
