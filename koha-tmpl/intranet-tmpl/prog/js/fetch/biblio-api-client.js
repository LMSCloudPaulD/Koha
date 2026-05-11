export class BiblioAPIClient {
    constructor(HttpClient) {
        this.httpClient = new HttpClient({
            baseURL: "/api/v1/",
        });
    }

    get biblios() {
        return {
            items: (id, params, headers) =>
                this.httpClient.getAll({
                    endpoint: "biblios/" + id + "/items",
                    params,
                    headers,
                }),
            bookings: (id, query, params) =>
                this.httpClient.getAll({
                    endpoint: "biblios/" + id + "/bookings",
                    query,
                    params,
                }),
            checkouts: id =>
                this.httpClient.getAll({
                    endpoint: "biblios/" + id + "/checkouts",
                }),
            pickup_locations: (id, params) =>
                this.httpClient.getAll({
                    endpoint: "biblios/" + id + "/pickup_locations",
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
