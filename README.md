# TypeScript Java

A surprisingly nontrivial observation about the Java programming language is that needs not be restricted to its own language specification.
Indeed, by obeying proper programming principles you can quite literally re-implement the JVM itself within different language runtimes.

Will it be the most efficient? No. But that is not the point.

The objective of this library is to provide a linguistic bridge between the frontend and backend, and supplement standard TypeScript development
with the good practices that are imposed on Java developers essentially by default due to the nature of the language.

### Future Goals

- Java Language concepts sorely missing in JavaScript
- DTO Wire contracts to/from backend frameworks (Spring/Jackson/Raw Tomcat)
- XML Parsing (JavaBeans)