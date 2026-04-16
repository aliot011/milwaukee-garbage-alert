const commands = [
  {
    keyword: "STATUS",
    color: "bg-blue-100 text-blue-800",
    description: "Check your schedule — get your next garbage and recycling pickup dates.",
  },
  {
    keyword: "MISSED",
    color: "bg-yellow-100 text-yellow-800",
    description: "Report a missed pickup — reply MISSED (or NOPICKUP) if your garbage or recycling was skipped.",
  },
  {
    keyword: "7PM",
    color: "bg-purple-100 text-purple-800",
    description: "Change your reminder time — text any hour (e.g. 7PM or 8AM) to receive alerts at that time the night before pickup.",
  },
  {
    keyword: "HELP",
    color: "bg-blue-100 text-blue-800",
    description: "Get info and support contact details.",
  },
  {
    keyword: "STOP",
    color: "bg-red-100 text-red-800",
    description: "Stop alerts — unsubscribe at any time, instantly.",
  },
];

export default function CommandsSection() {
  return (
    <section className="bg-background py-14 px-4">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-10">Texts you can send</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {commands.map((cmd) => (
            <div key={cmd.keyword} className="flex items-start gap-3 bg-white rounded-xl border border-border p-4">
              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${cmd.color} flex-shrink-0`}>
                {cmd.keyword}
              </span>
              <p className="text-sm text-muted-foreground leading-relaxed">{cmd.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
