// @ts-check

/**
 * AdditionalFields Module
 *
 * A reusable module for handling additional fields in Koha forms.
 * This module provides functionality for managing extended attributes and additional fields
 * in a generic way that can be used across different Koha forms.
 *
 * Usage:
 * const additionalFields = AdditionalFields.init({
 *     containerId: 'my_form_extended_attributes',
 *     resourceType: 'my_resource_type',
 *     onFieldsChanged: (fields) => {
 *         // Handle field changes
 *     },
 *     selectors: {
 *         repeatableFieldClass: 'repeatable-field',
 *         inputClass: 'extended-attribute',
 *         fieldPrefix: 'extended_attributes'
 *     }
 * });
 *
 * Methods:
 * - init(options): Initialize the module with configuration options
 * - getValues(): Get all field values from the form
 * - setValues(values): Set field values in the form
 * - clear(): Clear all field values
 * - renderExtendedAttributes(types, values): Render extended attributes in the form
 * - fetchExtendedAttributes(resourceType): Fetch extended attribute types from the server
 */

/**
 * @typedef {Object} AdditionalFieldsConfig
 * @property {string} containerId - ID of the container element
 * @property {string} resourceType - Type of resource (e.g., 'booking', 'patron')
 * @property {Function} onFieldsChanged - Callback for field changes
 * @property {Object} selectors - Custom selectors
 * @property {string} selectors.repeatableFieldClass - Class for repeatable fields
 * @property {string} selectors.inputClass - Class for input elements
 * @property {string} selectors.fieldPrefix - Prefix for field names
 */

/**
 * @typedef {Object} ExtendedAttributeType
 * @property {number} extended_attribute_type_id - The ID of the extended attribute type
 * @property {string} name - The name of the extended attribute type
 * @property {string|null} authorised_value_category_name - The category name for authorized values, if any
 * @property {boolean} repeatable - Whether the attribute is repeatable
 * @property {string} resource_type - The resource type this attribute belongs to
 * @property {string} marc_field - The MARC field associated with this attribute
 * @property {string} marc_field_mode - The MARC field mode (get/set)
 * @property {boolean} searchable - Whether the attribute is searchable
 */

/**
 * @typedef {Object} ExtendedAttribute
 * @property {number} field_id - The ID of the extended attribute
 * @property {string} id - The unique identifier
 * @property {string} record_id - The ID of the record this attribute belongs to
 * @property {string} value - The value of the extended attribute
 */

/**
 * @typedef {Object} AuthorizedValue
 * @property {number} authorised_value_id - The ID of the authorized value
 * @property {string} category_name - The category name
 * @property {string} description - The description text
 * @property {string} image_url - The image URL, if any
 * @property {string|null} opac_description - The OPAC description, if any
 * @property {string} value - The value code
 */

/**
 * @typedef {Object.<string, ExtendedAttributeValue>} ExtendedAttributeValues
 */

/**
 * @typedef {Object} ExtendedAttributeValue
 * @property {number} field_id - The ID of the extended attribute type
 * @property {string} value - The value of the extended attribute
 */

const AdditionalFields = (function () {
    /** @type {AdditionalFieldsConfig} */
    let config = {
        containerId: "",
        resourceType: "",
        onFieldsChanged: () => {},
        selectors: {
            repeatableFieldClass: "repeatable-field",
            inputClass: "extended-attribute",
            fieldPrefix: "extended_attributes",
        },
    };

    /**
     * Initialize the module with configuration options
     * @param {Object} options - Configuration options
     * @param {string} options.containerId - ID of the container element
     * @param {string} options.resourceType - Type of resource (e.g., 'booking', 'patron')
     * @param {Function} options.onFieldsChanged - Callback for field changes
     * @param {Object} options.selectors - Custom selectors
     * @param {string} options.selectors.repeatableFieldClass - Class for repeatable fields
     * @param {string} options.selectors.inputClass - Class for input elements
     * @param {string} options.selectors.fieldPrefix - Prefix for field names
     */
    function init(options) {
        config = {
            ...config,
            ...options,
            selectors: {
                ...config.selectors,
                ...(options.selectors || {}),
            },
        };

        return {
            init,
            getValues,
            setValues,
            clear,
            renderExtendedAttributes,
            fetchExtendedAttributes,
        };
    }

    /**
     * Get all field values from the form
     * @returns {ExtendedAttributeValue[]} Array of extended attribute values
     */
    function getValues() {
        const container = document.getElementById(config.containerId);
        if (!container) return [];

        const values = [];
        const inputs = container.querySelectorAll(`input, select`);

        inputs.forEach(input => {
            if (
                input instanceof HTMLInputElement ||
                input instanceof HTMLSelectElement
            ) {
                const name = input.name.replace(
                    `${config.selectors.fieldPrefix}.`,
                    ""
                );
                const fieldId = parseInt(name.replace(/\[.*\]/, ""), 10);

                if (
                    input.closest(`.${config.selectors.repeatableFieldClass}`)
                ) {
                    // For repeatable fields, each value becomes a separate entry
                    values.push({
                        field_id: fieldId,
                        value: input.value,
                    });
                } else {
                    values.push({
                        field_id: fieldId,
                        value: input.value,
                    });
                }
            }
        });

        return values;
    }

    /**
     * Set field values in the form
     * @param {Object} values - Field values to set
     */
    function setValues(values) {
        const container = document.getElementById(config.containerId);
        if (!container) return;

        Object.entries(values).forEach(([name, value]) => {
            const input = container.querySelector(
                `[name="${config.selectors.fieldPrefix}.${name}"]`
            );
            if (
                input instanceof HTMLInputElement ||
                input instanceof HTMLSelectElement
            ) {
                input.value = value;
            }
        });
    }

    /**
     * Clear all field values
     */
    function clear() {
        const container = document.getElementById(config.containerId);
        if (!container) return;

        const inputs = container.querySelectorAll(`input, select`);
        inputs.forEach(input => {
            if (
                input instanceof HTMLInputElement ||
                input instanceof HTMLSelectElement
            ) {
                input.value = "";
            }
        });
    }

    /**
     * Renders the header for the extended attributes section
     * @param {HTMLElement} container - The container element
     * @returns {HTMLElement|null} The loading state indicator element
     */
    function renderExtendedAttributesHeader(container) {
        const orderedListElement = container.closest("ol");
        if (!(orderedListElement instanceof HTMLOListElement)) {
            return null;
        }

        const headerId = `${config.containerId}_header`;
        const spinnerId = `${config.containerId}_spinner`;

        const headerDiv = document.createElement("div");
        headerDiv.className = "d-flex";
        headerDiv.id = headerId;

        const heading = document.createElement("h2");
        heading.className = "fs-5 mt-3";
        heading.textContent = __("Extended Attributes");
        headerDiv.appendChild(heading);

        const spinner = document.createElement("div");
        spinner.className = "spinner-border text-primary d-none";
        spinner.id = spinnerId;
        spinner.setAttribute("role", "status");
        spinner.style.display = "none";

        const spinnerText = document.createElement("span");
        spinnerText.className = "visually-hidden";
        spinnerText.textContent = __("Loading") + "...";
        spinner.appendChild(spinnerText);

        headerDiv.appendChild(spinner);
        orderedListElement.parentNode.insertBefore(
            headerDiv,
            orderedListElement
        );

        setTimeout(() => {
            spinner.classList.toggle("d-none");
        }, 50);

        return spinner;
    }

    /**
     * Render extended attributes in the form
     * @param {Array} types - Extended attribute types
     * @param {Object} values - Current values
     */
    function renderExtendedAttributes(types, values) {
        const container = document.getElementById(config.containerId);
        if (!container) return;

        const loadingStateIndicator = renderExtendedAttributesHeader(container);
        if (!loadingStateIndicator) return;

        // Clear existing content
        container.innerHTML = "";

        if (!types || types.length === 0) {
            const header = document.getElementById(
                `${config.containerId}_header`
            );
            if (header) header.style.display = "none";
            loadingStateIndicator.remove();
            return;
        }

        types.forEach(type => {
            const value = values
                ? values[type.extended_attribute_type_id]
                : null;
            const field = createField(type, value);
            if (field) container.appendChild(field);
        });

        loadingStateIndicator.remove();
    }

    /**
     * Create a field element for an extended attribute type
     * @param {ExtendedAttributeType} type - Extended attribute type
     * @param {string|string[]|null} value - Current value
     * @returns {HTMLElement} Field element
     */
    function createField(type, value) {
        const field = document.createElement("li");
        field.className = "form-group";

        const label = document.createElement("label");
        label.className = "control-label";
        label.setAttribute(
            "for",
            `extended_attribute_${type.extended_attribute_type_id}`
        );
        label.textContent = type.name;
        field.appendChild(label);

        if (type.repeatable) {
            const values = Array.isArray(value)
                ? value
                : [value].filter(Boolean);
            const repeatableContainer = document.createElement("div");
            repeatableContainer.className = "repeatable-field";

            // Always create at least one input field for repeatable fields
            if (values.length === 0) {
                values.push("");
            }

            values.forEach((val, index) => {
                const input = createInput(type, val || "", index);
                if (input) repeatableContainer.appendChild(input);
            });
            field.appendChild(repeatableContainer);

            const addButton = document.createElement("button");
            addButton.type = "button";
            addButton.className = "btn btn-sm btn-link add-repeatable";
            addButton.setAttribute(
                "data-attribute-id",
                `extended_attribute_${type.extended_attribute_type_id}`
            );

            const addIcon = document.createElement("i");
            addIcon.className = "fa fa-plus";
            addButton.appendChild(addIcon);

            const addText = document.createTextNode(__("Add"));
            addButton.appendChild(addText);

            addButton.onclick = () => {
                const newInput = createInput(type, "", values.length);
                if (newInput) repeatableContainer.appendChild(newInput);
            };
            field.appendChild(addButton);

            const hint = document.createElement("div");
            hint.className = "hint";
            hint.textContent = __("Add multiple values if needed");
            field.appendChild(hint);
        } else {
            const input = createInput(
                type,
                Array.isArray(value) ? value[0] || "" : value || ""
            );
            if (input) field.appendChild(input);
        }

        return field;
    }

    /**
     * Create an input element for an extended attribute type
     * @param {ExtendedAttributeType} type - Extended attribute type
     * @param {string} value - Current value
     * @param {number} index - Index for repeatable fields
     * @returns {HTMLElement} Input element
     */
    function createInput(type, value, index = 0) {
        const wrapper = document.createElement("div");
        wrapper.className = "d-flex align-items-center mb-2";

        let input;
        if (type.authorised_value_category_name) {
            input = document.createElement("select");
            input.className = `${config.selectors.inputClass} form-control form-control-sm w-50`;
            input.id = `extended_attribute_${type.extended_attribute_type_id}${type.repeatable ? `_${index}` : ""}`;
            input.name = `${config.selectors.fieldPrefix}.${type.extended_attribute_type_id}${type.repeatable ? `[${index}]` : ""}`;

            // Add default option
            const defaultOption = document.createElement("option");
            defaultOption.value = "";
            defaultOption.textContent = __("Select an option");
            input.appendChild(defaultOption);

            // Fetch and populate authorized values
            fetchAuthorizedValues(type.authorised_value_category_name).then(
                values => {
                    console.log(values);
                    values.forEach(val => {
                        const option = document.createElement("option");
                        option.value = val.value;
                        option.textContent = val.description;
                        if (value === val.value) option.selected = true;
                        input.appendChild(option);
                    });
                }
            );
        } else {
            input = document.createElement("input");
            input.type = "text";
            input.className = `${config.selectors.inputClass} form-control form-control-sm w-50`;
            input.id = `extended_attribute_${type.extended_attribute_type_id}${type.repeatable ? `_${index}` : ""}`;
            input.name = `${config.selectors.fieldPrefix}.${type.extended_attribute_type_id}${type.repeatable ? `[${index}]` : ""}`;
            input.value = value || "";
        }

        wrapper.appendChild(input);

        if (type.repeatable) {
            const removeButton = document.createElement("button");
            removeButton.type = "button";
            removeButton.className =
                "btn btn-sm btn-link remove-repeatable ms-2";

            const removeIcon = document.createElement("i");
            removeIcon.className = "fa fa-minus";
            removeButton.appendChild(removeIcon);

            const removeText = document.createTextNode(__("Remove"));
            removeButton.appendChild(removeText);

            removeButton.onclick = () => wrapper.remove();
            wrapper.appendChild(removeButton);
        }

        return wrapper;
    }

    /**
     * Fetch authorized values for a category
     * @param {string} category - The category name
     * @returns {Promise<AuthorizedValue[]>} A promise that resolves to an array of authorized values
     */
    function fetchAuthorizedValues(category) {
        return fetch(
            `/api/v1/authorised_value_categories/${category}/authorised_values`
        )
            .then(response => response.json())
            .catch(error => {
                console.error("Error fetching authorized values:", error);
                return [];
            });
    }

    /**
     * Fetch extended attribute types for a resource type
     * @param {string} resourceType - Type of resource
     * @returns {Promise<Array>} Extended attribute types
     */
    function fetchExtendedAttributes(resourceType) {
        const header = document.getElementById(`${config.containerId}_header`);
        const spinner = document.getElementById(
            `${config.containerId}_spinner`
        );

        if (header && spinner) {
            header.style.display = "none";
            spinner.style.display = "block";
        }

        return fetch(
            `/api/v1/extended_attribute_types?resource_type=${resourceType}`
        )
            .then(response => response.json())
            .catch(error => {
                console.error(
                    "Error fetching extended attribute types:",
                    error
                );
                return [];
            });
    }

    return {
        init,
        getValues,
        setValues,
        clear,
        renderExtendedAttributes,
        fetchExtendedAttributes,
    };
})();
