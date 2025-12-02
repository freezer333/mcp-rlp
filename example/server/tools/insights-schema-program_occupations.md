# program_occupations

Junction table linking academic programs (CIP codes) to related careers (BLS occupations).

## Schema

```sql
CREATE TABLE program_occupations (
    cip_code TEXT NOT NULL,
    bls_code TEXT NOT NULL,
    occupation_title TEXT NOT NULL,
    bls_url TEXT NOT NULL,

    PRIMARY KEY (cip_code, bls_code),
    FOREIGN KEY (cip_code) REFERENCES programs(cip_code),
    FOREIGN KEY (bls_code) REFERENCES occupations(bls_code)
);
```

## Columns

- **cip_code** - Academic program code (references programs.cip_code)
- **bls_code** - BLS occupation code (references occupations.bls_code)
- **occupation_title** - Occupation title (denormalized from occupations for convenience)
- **bls_url** - BLS profile URL (denormalized from occupations for convenience)

## Indexes
- idx_prog_occ (cip_code)

## Usage Notes
- One row per program-occupation relationship
- A single program may lead to multiple careers
- A single occupation may be reached through multiple programs
- Occupation fields are denormalized to avoid joins when looking up careers for a program
- Use `cip_code` to find all careers related to a specific program
- Use `bls_code` to find all programs that lead to a specific career

## Example Query
```sql
-- Find all careers for Computer Science programs
SELECT occupation_title, bls_url
FROM program_occupations
WHERE cip_code LIKE '11.%'
ORDER BY occupation_title;
```
