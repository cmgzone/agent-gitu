FROM node:22-alpine
WORKDIR /app
COPY *.html styles.css script.js support-widget.js robots.txt sitemap.xml support-server.cjs support-ticket.cjs /app/
COPY assets/ /app/assets/
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "support-server.cjs"]
