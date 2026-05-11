/**
 * Ambient module declarations for third-party libraries that ship without
 * type definitions, and for non-code side-effect imports (CSS).
 */

declare module "*.css";

declare module "bootstrap" {
    export class Modal {
        constructor(element: Element | string, options?: object);
        show(): void;
        hide(): void;
        toggle(): void;
        dispose(): void;
        static getInstance(element: Element | string): Modal | null;
        static getOrCreateInstance(
            element: Element | string,
            options?: object
        ): Modal;
    }
}

declare module "vue-select";
