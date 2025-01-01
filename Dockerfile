# Use an official Python runtime as the base image
FROM python:3.13-slim

# Set the working directory in the container
WORKDIR /app

# Copy the current directory contents into the container
COPY . /app

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Expose the port your app will run on
EXPOSE 8080

# Command to run your application
CMD ["python", "main.py"]
