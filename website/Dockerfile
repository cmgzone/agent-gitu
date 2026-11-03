FROM node:22-alpine
WORKDIR /app
COPY *.html styles.css news.css changelog.css script.js news.js changelog.js news.json changelog.json support-widget.js robots.txt sitemap.xml support-server.cjs support-ticket.cjs /app/
COPY assets/ /app/assets/
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "support-server.cjs"]
