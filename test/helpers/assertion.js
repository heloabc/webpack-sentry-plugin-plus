// Work around Jest not having expect.fail()
function expectNoFailure(msg) {
  return () => {
    throw new Error(msg)
  }
}

function expectReleaseContainsFile(filename) {
  return (files) => {
    const filenames = files.map(({ name }) => name)
    expect(filenames).toContain(filename)

    return Promise.resolve(files)
  }
}

function expectReleaseDoesNotContainFile(filename) {
  return (files) => {
    const filenames = files.map(({ name }) => name)
    expect(filenames).not.toContain(filename)

    return Promise.resolve(files)
  }
}

module.exports = {
  expectNoFailure,
  expectReleaseContainsFile,
  expectReleaseDoesNotContainFile,
}
