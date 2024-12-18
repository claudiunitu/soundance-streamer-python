import json
import multiprocessing
import queue
from typing import List

from processor_functions import log_for_polling, process_json, \
    messages_lock
from flask import Flask, request, jsonify, send_from_directory



class Processor:

    is_already_processing = False

    def __init__(self, messages_for_polling):
        self.messages_for_polling = messages_for_polling
        self.app = Flask(__name__, static_folder='webapp/src')
        self.setup_routes()
        self.app.run()

    def process_json_from_file(self):
        if self.is_already_processing:
            return

        with open("currentConfig.json", "r") as file:
            log_for_polling("Parsing json config file...")
            json_data = json.load(file)
            self.is_already_processing = True
            process_json(json_data)
            self.is_already_processing = False

    def run(self, debug=False):
        self.app.run(debug=debug)

    def serve_index(self):
        return send_from_directory(self.app.static_folder, 'index.html')

    def serve_static(self, filename):
        return send_from_directory(self.app.static_folder, filename)

    def handle_post(self):
        if self.is_already_processing:
            return jsonify({"message": "Cannot take another task while still processing."}), 400

        if not request.is_json:
            return {"error": "Request must be JSON"}, 400

        data = request.get_json()
        if data:

            process = multiprocessing.Process(target=process_json, args=(data, self.messages_for_polling))
            self.is_already_processing = True

            process.start()
            process.join()
            self.is_already_processing = False

            # process_json(data)
            return jsonify({"message": "Success"}), 200
        else:
            return jsonify({"message": "Invalid JSON"}), 400

    def serve_status(self):
        with messages_lock:  # Ensure thread-safe access to messages_for_polling
            # Try to get the latest messages from the queue
            print(self.messages_for_polling)
            return jsonify(list(self.messages_for_polling))


    def setup_routes(self):
        @self.app.route('/')
        def serve_index_route():
            return self.serve_index()

        @self.app.route('/<path:filename>')
        def serve_static_route(filename):
            return self.serve_static(filename)

        @self.app.route('/process_json', methods=['POST'])
        def handle_post_route():
            return self.handle_post()

        @self.app.route('/serve_status')
        def serve_status():
            return self.serve_status()


if __name__ == '__main__':
    with multiprocessing.Manager() as manager:
        messages_for_polling = manager.list(['Hello'])
        app_instance = Processor(messages_for_polling)
        # process_json_from_file()
