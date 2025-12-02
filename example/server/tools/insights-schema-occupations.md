# occupations

BLS (Bureau of Labor Statistics) occupation data with links to detailed career information.

## Schema

```sql
CREATE TABLE occupations (
    bls_code TEXT PRIMARY KEY,
    occupation_title TEXT NOT NULL,
    bls_url TEXT NOT NULL
);
```

## Columns

- **bls_code** - BLS occupation code (e.g., "15-1252")
- **occupation_title** - Official occupation title (e.g., "Software Developers")
- **bls_url** - Link to BLS occupation profile page with detailed career information

## Usage Notes
- Contains BLS-recognized occupations
- Links to program_occupations table to show which academic programs lead to which careers
- BLS URLs provide salary data, job outlook, education requirements, and work environment details
- Not all occupations have corresponding academic programs in the database
