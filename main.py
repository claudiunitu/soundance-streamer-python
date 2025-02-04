import json
import multiprocessing
import os
import queue
from typing import List

from processor_functions import log_for_polling, process_json, \
    messages_lock
from flask import Flask, request, jsonify, send_from_directory


class Processor:

    def __init__(self, _messages_for_polling):
        self.saved_scenes_config_filename = "saved_scenes_config.json"
        self.is_already_processing = False
        self.messages_for_polling = _messages_for_polling
        self.app = Flask(__name__, static_folder='webapp/src')
        self.setup_routes()

    def start_server(self):
        self.app.run(host='0.0.0.0', port=5000)

    def process_json_from_file(self):
        if self.is_already_processing:
            return

        with open("currentConfig.json", "r") as file:
            log_for_polling("Parsing json config file...", self.messages_for_polling)
            json_data = json.load(file)
            self.is_already_processing = True
            process_json(json_data, self.messages_for_polling)
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
            # process.join()
            self.is_already_processing = False

            # process_json(data)
            return jsonify({"message": "Success"}), 200
        else:
            return jsonify({"message": "Invalid JSON"}), 400

    def save_user_scenes_config(self):
        if not request.is_json:
            return {"error": "Request must be JSON"}, 400

        data = request.get_json()
        if not data:
            return jsonify({"message": "Invalid JSON"}), 400

        try:
            with open(self.saved_scenes_config_filename, "w") as file:
                json.dump(data, file)
            return jsonify({"message": "JSON data saved successfully"}), 200
        except Exception as e:
            return jsonify({"error": f"Failed to save JSON: {str(e)}"}), 500

    def load_user_scenes_config(self):
        if not os.path.exists(self.saved_scenes_config_filename):
            return jsonify({"error": "File not found"}), 404

        try:
            with open(self.saved_scenes_config_filename, "r") as file:
                data = json.load(file)
            return jsonify(data), 200
        except json.JSONDecodeError:
            return jsonify({"error": "Invalid JSON format in file"}), 500
        except Exception as e:
            return jsonify({"error": f"Failed to read JSON: {str(e)}"}), 500

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

        @self.app.route('/save_user_scenes_config', methods=['POST'])
        def save_user_scenes_config_route():
            return self.save_user_scenes_config()

        @self.app.route('/load_user_scenes_config', methods=['GET'])
        def load_user_scenes_config_route():
            return self.load_user_scenes_config()

        @self.app.route('/serve_status')
        def serve_status_route():
            return self.serve_status()


if __name__ == '__main__':
    with multiprocessing.Manager() as manager:
        messages_for_polling = manager.list(['Hello'])
        app_instance = Processor(messages_for_polling)
        app_instance.start_server()
        # process_json_from_file()
