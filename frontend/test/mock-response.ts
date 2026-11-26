export function mockResponse() {
    return {
        status: 0,
        text: "",
        writeHead(status: number) {
            this.status = status;
            return this;
        },
        end(text = "") {
            this.text = text;
            return this;
        },
    };
}
