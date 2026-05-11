/**
 * Vue component type declarations for template type checking.
 */

import type { ComponentCustomProperties } from "vue";

/**
 * Augment Vue's component custom properties to include $__ for i18n.
 * This allows vue-tsc to recognize $__ in templates.
 */
declare module "vue" {
    interface ComponentCustomProperties {
        /**
         * i18n translation function - translates the given string.
         * @param str - The string to translate
         * @returns The translated string (with .format() method for placeholders)
         */
        $__: (
            str: string
        ) => string & { format: (...args: unknown[]) => string };
    }
}

/**
 * Global $__ function available via import from i18n module.
 */
declare global {
    /**
     * Koha i18n translation function.
     */
    function $__(
        str: string
    ): string & { format: (...args: unknown[]) => string };

    /**
     * String prototype extension for i18n formatting.
     * Koha extends String.prototype with a format method for placeholder substitution.
     */
    interface String {
        /**
         * Format string with placeholder substitution.
         * @param args - Values to substitute for placeholders
         * @returns Formatted string
         */
        format(...args: unknown[]): string;
    }
}

export {};
