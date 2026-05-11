export class LibraryAPIClient {
    constructor(HttpClient) {
        this.httpClient = new HttpClient({
            baseURL: "/api/v1/libraries/",
        });
    }

    get libraries() {
        return {
            closed_dates: (id, params) => {
                const urlParams = new URLSearchParams();
                if (params) {
                    Object.entries(params).forEach(([k, v]) => {
                        if (v !== undefined && v !== null) {
                            urlParams.set(k, String(v));
                        }
                    });
                }
                const qs = urlParams.toString();
                return this.httpClient.get({
                    endpoint: id + "/closed_dates" + (qs ? "?" + qs : ""),
                });
            },
        };
    }
}

export default LibraryAPIClient;
