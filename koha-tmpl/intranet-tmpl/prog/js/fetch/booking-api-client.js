export class BookingAPIClient {
    constructor(HttpClient) {
        this.httpClient = new HttpClient({
            baseURL: "/api/v1/",
        });
    }

    get bookings() {
        return {
            create: body =>
                this.httpClient.post({
                    endpoint: "bookings",
                    body,
                }),
            update: (id, body) =>
                this.httpClient.put({
                    endpoint: "bookings/" + id,
                    body: { ...body, booking_id: id },
                }),
        };
    }
}

export default BookingAPIClient;
