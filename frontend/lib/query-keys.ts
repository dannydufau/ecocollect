export const queryKeys = {
    myRequests: ["requests", "mine"],
    availableRequests: ["requests", "available"],
    volunteerRequests: ["requests", "volunteer"],
    request: (id: string) => ["request", id] as const,
    profile: ["profile"],
    notifications: ["notifications"],
    ecopoints: ["ecopoints"],
    publicProfile: (accountId: string) => ["public-profile", accountId] as const,
    publicStats: ["public-stats"],
    categories: ["categories"],
    facilities: (categoryId: string) => ["facilities", categoryId] as const,
    terms: ["terms"],
} as const;
