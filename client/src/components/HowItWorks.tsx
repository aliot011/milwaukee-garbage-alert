const steps = [
  {
    number: "1",
    title: "Enter your info",
    description: "Provide your mobile number and Milwaukee address in the form above.",
  },
  {
    number: "2",
    title: "We validate your address",
    description:
      "We check your address against the City of Milwaukee's official collection schedule.",
  },
  {
    number: "3",
    title: "Confirm via text",
    description:
      "You'll receive a text — reply YES to turn on alerts. If the address can't be matched, we'll let you know.",
  },
];

export default function HowItWorks() {
  return (
    <section className="bg-white py-14 px-4">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-10">How it works</h2>
        <div className="grid sm:grid-cols-3 gap-8">
          {steps.map((step) => (
            <div key={step.number} className="flex flex-col items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm flex-shrink-0">
                {step.number}
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
