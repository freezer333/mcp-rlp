# programs

CIP (Classification of Instructional Programs) code taxonomy with three hierarchical levels.

## Schema

```sql
CREATE TABLE programs (
    cip_code TEXT PRIMARY KEY,
    cip_type TEXT NOT NULL CHECK(cip_type IN ('family', 'group', 'program')),

    family_code TEXT,
    family_name TEXT,
    group_code TEXT,
    group_name TEXT,

    program_name TEXT NOT NULL,
    program_description TEXT
);
```

## Columns

### Identification
- **cip_code** - CIP code (2-digit, 4-digit, or 6-digit format)
- **cip_type** - Taxonomy level: "family" (2-digit), "group" (4-digit), or "program" (6-digit)

### Hierarchy (Denormalized)
- **family_code** - Parent family code (2-digit), NULL for family records
- **family_name** - Parent family name (e.g., "Education"), NULL for family records
- **group_code** - Parent group code (4-digit), NULL for family and group records
- **group_name** - Parent group name (e.g., "Teacher Education"), NULL for family and group records

### Details
- **program_name** - Official program name (e.g., "Agricultural Teacher Education")
- **program_description** - Detailed description of the program (may be NULL)

## Indexes
- idx_prog_search (program_name, cip_code)
- idx_prog_hierarchy (family_code, group_code)
- idx_prog_type (cip_type)

## Hierarchy Example
```
13 (family) → Education
  ↓
13.13 (group) → Teacher Education
  ↓
13.1301 (program) → Agricultural Teacher Education
```

## Usage Notes
- Filter by `cip_type = 'program'` for specific degree programs
- Filter by `cip_type = 'family'` for high-level categories
- Use `family_code` and `group_code` to traverse the hierarchy
- All program records include their parent family and group for easy aggregation
