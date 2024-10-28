from flask import Flask, Response
import os
from pydub import AudioSegment
import io

app = Flask(__name__)

# Set the directory containing audio files
sound_dir = './sound-samples'
# Collect all .wav files in the directory
audio_files = [os.path.join(sound_dir, file) for file in os.listdir(sound_dir) if file.endswith('.wav')]

# Ensure there are audio files to stream
if not audio_files:
    raise Exception("No audio files found in the specified directory.")

# Load the audio file once
audio_path = audio_files[0]  # Use the first audio file for streaming
audio = AudioSegment.from_wav(audio_path)

# Create a bytesIO object for the audio data
audio_data = io.BytesIO()
audio.export(audio_data, format="wav")
audio_data.seek(0)  # Reset to the start

# Get the total length of the audio data for the Content-Length header
content_length = audio_data.getbuffer().nbytes

def generate_audio_stream():
    while True:
        # Reset the audio data to the beginning for continuous streaming
        audio_data.seek(0)

        # Stream the audio in small chunks
        while True:
            chunk = audio_data.read(4096)  # Read in 4 KB chunks
            if not chunk:
                # If we reach the end of the audio, reset to the beginning
                audio_data.seek(0)  # Reset to the start
                continue  # Loop back to the start

            yield chunk  # Yield the chunk to the client

@app.route('/stream')
def stream_audio():
    # Create a streaming response with proper headers
    response = Response(generate_audio_stream(),
                        mimetype="audio/wav",
                        headers={
                            "Cache-Control": "no-cache, no-store, must-revalidate",  # Prevent caching
                            "Pragma": "no-cache",  # HTTP 1.0
                            "Expires": "0",  # Proxies
                            "Connection": "keep-alive",  # Keep the connection open
                            "Content-Type": "audio/wav",  # Set the correct content type
                            "Content-Length": str(content_length),  # Set content length
                        })

    return response

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, threaded=True)
