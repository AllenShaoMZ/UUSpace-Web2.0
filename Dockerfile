FROM python:3.12-slim

WORKDIR /app

COPY index.html styles.css app.js ./
COPY assets ./assets
COPY tools ./tools

EXPOSE 8080/tcp
EXPOSE 7101/udp
EXPOSE 7102/udp
EXPOSE 7103/udp
EXPOSE 7104/udp
EXPOSE 7105/udp
EXPOSE 7106/udp
EXPOSE 7107/udp
EXPOSE 7108/udp

CMD ["python", "tools/udp_web_server.py", "--root", "/app", "--host", "0.0.0.0", "--http-port", "8080", "--udp-host", "0.0.0.0", "--udp-ports", "7101-7108", "--meter-file", "/meter/卫星1遥测大表.xlsx"]
