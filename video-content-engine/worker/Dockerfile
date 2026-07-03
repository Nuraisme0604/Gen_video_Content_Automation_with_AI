FROM python:3.11-slim

# Install system dependencies: FFmpeg, fonts, wget
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsm6 \
    libxext6 \
    wget \
    fontconfig \
    imagemagick \
    && rm -rf /var/lib/apt/lists/*

# Fix ImageMagick policy to allow TextClip
RUN sed -i 's/<policy domain="path" rights="none" pattern="@\*"\/>/<!-- <policy domain="path" rights="none" pattern="@\*"\/> -->/g' /etc/ImageMagick-6/policy.xml || true

# Install Google Font (Montserrat Bold) for thumbnail text overlay
RUN mkdir -p /usr/share/fonts/truetype/montserrat && \
    wget -q -O /usr/share/fonts/truetype/montserrat/Montserrat-Bold.ttf \
    "https://github.com/JulietaUla/Montserrat/raw/master/fonts/ttf/Montserrat-Bold.ttf" && \
    fc-cache -f -v

# Set working directory
WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the worker code
COPY . .

EXPOSE 8000

# Run the server
CMD ["uvicorn", "main_server:app", "--host", "0.0.0.0", "--port", "8000"]
