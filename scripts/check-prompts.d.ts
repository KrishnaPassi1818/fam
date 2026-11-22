interface PromptCheckResult {
    file: string;
    budget: number;
    tokens: number;
    passed: boolean;
    bannedStrings: string[];
}
export declare function checkPrompts(promptsDir: string): {
    allPassed: boolean;
    results: PromptCheckResult[];
};
export {};
//# sourceMappingURL=check-prompts.d.ts.map