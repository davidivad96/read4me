const handler = async (event) => {
  const text = event.Blocks.reduce(
    (acc, curr) => (curr.BlockType === "LINE" && curr.Text ? `${acc.concat(curr.Text)} ` : acc),
    ""
  );
  return text;
};

export { handler };
