export class CirculationRulesAPIClient {
    constructor(HttpClient) {
        this.httpClient = new HttpClient({
            baseURL: "/api/v1/",
        });
    }

    get rules() {
        return {
            get: params => {
                const urlParams = new URLSearchParams();
                if (params) {
                    Object.entries(params).forEach(([k, v]) => {
                        if (v !== undefined && v !== null && v !== "") {
                            urlParams.set(k, String(v));
                        }
                    });
                }
                return this.httpClient.get({
                    endpoint: "circulation_rules?" + urlParams.toString(),
                });
            },
        };
    }
}

export default CirculationRulesAPIClient;
