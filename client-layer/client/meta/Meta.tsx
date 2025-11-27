const Meta = ({ title, keywords, description }: { title: string; keywords: string; description: string }) => (
    <head>
        <title>{title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="keywords" content={keywords} />
        <meta name="description" content={description} />
        <meta charSet="utf-8" />
        <link rel="shortcut icon" href="/favicon.ico" />
    </head>
)

export default Meta
