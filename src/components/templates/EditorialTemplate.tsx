import ContactSection from "@/components/organisms/ContactSection";
import JsonLd from "@/components/seo/JsonLd";
import type { EditorialData } from "@/modules/content/server/editorial";
import { breadcrumbSchema, contactPageSchema } from "@/shared/seo/structured-data";

export default function EditorialTemplate({ data }: { data: EditorialData }) {
  const { title, path, html, body, isContact, article, kind } = data;
  return (
    <article>
      {article && <JsonLd data={article} />}
      <JsonLd data={breadcrumbSchema([
        { name: "Home", path: "/" },
        ...(kind === "post" ? [{ name: "Journal", path: "/blog" }] : []),
        { name: title, path },
      ])} />
      {isContact && <JsonLd data={contactPageSchema()} />}
      {isContact ? <ContactSection title={title} /> : <>
        <h1>{title}</h1>
        {html !== null ? <div dangerouslySetInnerHTML={{ __html: html }} /> : body}
      </>}
    </article>
  );
}
