# Normalization: RECYCLING_FACILITY and FACILITY_ACCEPTS (#72)

## RECYCLING_FACILITY

**Functional dependencies**

- Facility_ID → Name, Street, Postal_Code, Special_Instructions

**1NF:** Every column holds a single value. The composite Address attribute from the ER is flattened into the Street and Postal_Code columns. The facility's accepted categories are a multi-valued fact, so they live in FACILITY_ACCEPTS and not in a list column.

**2NF:** The key is the single column Facility_ID, so no partial dependencies are possible.

**3NF:** No non-key column determines another non-key column. In particular, Name does not determine Street, because two facilities could share a name. Postal_Code → Street is not a dependency we rely on either, because one postal code can cover several streets.

## FACILITY_ACCEPTS

**Functional dependencies**

- (Facility_ID, Category_ID) → (nothing else; there are no non-key columns)

**1NF:** Each row records one facility accepting one category, and the values are atomic.

**2NF:** There are no non-key columns, so no partial dependencies are possible.

**3NF:** There are no non-key columns, so no transitive dependencies are possible.

This is the junction table for the ACCEPTS M:N relationship. Storing accepted categories here, and not as repeating columns or a list in RECYCLING_FACILITY, is what keeps RECYCLING_FACILITY in 1NF. It also means adding or removing a category is a single-row insert or delete, with no update anomalies.

## Result

Both tables are in 3NF (and BCNF), and no decomposition is needed.