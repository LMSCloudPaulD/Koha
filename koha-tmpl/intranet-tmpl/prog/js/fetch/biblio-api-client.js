export class BiblioAPIClient {
    constructor(HttpClient) {
        this.httpClient = new HttpClient({
            baseURL: "/api/v1/biblios/",
        });
    }

    get biblios() {
        return {
            items: (id, params, headers) =>
                this.httpClient.get({
                    endpoint:
                        id + "/items?" + new URLSearchParams(params).toString(),
                    headers,
                }),
            bookings: (id, query, params) =>
                this.httpClient.getAll({
                    endpoint: id + "/bookings",
                    query,
                    params,
                }),
            checkouts: id =>
                this.httpClient.get({
                    endpoint: id + "/checkouts",
                }),
            pickup_locations: (id, params) =>
                this.httpClient.getAll({
                    endpoint: id + "/pickup_locations",
                    params,
                }),
        };
    }

    get items() {
        return {
            get: id =>
                this.httpClient.get({
                    endpoint: "biblios/" + id + "/items",
                }),
        };
    }
}

export default BiblioAPIClient;
